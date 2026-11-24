import express from "express";
import { z } from "zod";
import type { PrismaClient } from "../generated/client";
import {
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
} from "../authz/sharing";
import { buildBoardContext } from "../ai/boardContext";
import {
  KimiClientError,
  requestKimiBoardResponse,
  streamKimiBoardResponse,
  type KimiSettings,
} from "../ai/kimi";
import type { AiResponse } from "../ai/operations";
import { createAiEventHub } from "../ai/events";

const messageRequestSchema = z
  .object({ message: z.string().trim().min(1).max(4000) })
  .strict();

const HISTORY_LIMIT = 24;
const MAX_CREATED_ELEMENTS_PER_REQUEST = 200;

type AiRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<T>,
  ) => express.RequestHandler;
  kimi: Omit<KimiSettings, "apiKey"> & { apiKey: string | null };
  requestKimi?: typeof requestKimiBoardResponse;
  streamKimi?: typeof streamKimiBoardResponse;
};

export const registerAiRoutes = (app: express.Express, deps: AiRouteDeps) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    kimi,
    requestKimi = requestKimiBoardResponse,
    streamKimi = streamKimiBoardResponse,
  } = deps;
  const eventHub = createAiEventHub();

  const getAccess = async (req: express.Request, drawingId: string) =>
    getDrawingAccess({
      prisma,
      principal: req.user?.id ? { kind: "user", userId: req.user.id } : null,
      drawingId,
    });

  const notFound = (res: express.Response) =>
    res.status(404).json({
      error: "Drawing not found",
      message: "Drawing does not exist or you do not have access",
    });

  const prepareMessageRequest = async (
    req: express.Request,
    res: express.Response,
  ) => {
    const drawingId = req.params.id;
    if (!canEditDrawing(await getAccess(req, drawingId))) {
      notFound(res);
      return null;
    }
    const parsed = messageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation error",
        message: "Message must contain between 1 and 4000 characters",
      });
      return null;
    }
    if (!kimi.apiKey) {
      res.status(503).json({
        error: "AI not configured",
        message: "Set KIMI_API_KEY in the backend environment and restart it",
      });
      return null;
    }

    const drawing = await prisma.drawing.findUnique({
      where: { id: drawingId },
      select: { name: true, elements: true, appState: true },
    });
    if (!drawing) {
      notFound(res);
      return null;
    }

    const conversation = await prisma.aiConversation.findUnique({
      where: { drawingId },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
        },
      },
    });
    const history = (conversation?.messages ?? []).reverse();
    const boardContext = buildBoardContext(
      drawing.name,
      JSON.parse(drawing.elements),
      JSON.parse(drawing.appState),
    );
    return {
      drawingId,
      message: parsed.data.message,
      history,
      boardContext,
    };
  };

  const hasValidOperationTargets = (
    response: AiResponse,
    boardContext: ReturnType<typeof buildBoardContext>,
  ) => {
    const existingIds = new Set(
      boardContext.elements.map((element) => element.id),
    );
    const createdIds = new Set<string>();
    for (const operation of response.operations) {
      if (operation.type !== "create") continue;
      for (const element of operation.elements) {
        if (!element.id) continue;
        if (existingIds.has(element.id) || createdIds.has(element.id)) {
          return false;
        }
        createdIds.add(element.id);
      }
    }
    const availableIds = new Set([...existingIds, ...createdIds]);
    const referencesExistingElement = response.operations.every((operation) => {
      if (operation.type !== "create") {
        return existingIds.has(operation.elementId);
      }
      return operation.elements.every(
        (element) =>
          element.type !== "frame" ||
          element.children.every((childId) => availableIds.has(childId)),
      );
    });
    const createdCount = response.operations.reduce(
      (count, operation) =>
        count + (operation.type === "create" ? operation.elements.length : 0),
      0,
    );
    return (
      referencesExistingElement &&
      createdCount <= MAX_CREATED_ELEMENTS_PER_REQUEST
    );
  };

  const saveExchange = async (
    drawingId: string,
    message: string,
    response: AiResponse,
    reasoning = "",
  ) =>
    prisma.$transaction(async (tx) => {
      const conversation = await tx.aiConversation.upsert({
        where: { drawingId },
        create: { drawingId },
        update: {},
      });
      const userMessage = await tx.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: message,
          createdAt: new Date(),
        },
        select: {
          id: true,
          role: true,
          content: true,
          reasoning: true,
          createdAt: true,
        },
      });
      const assistantMessage = await tx.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: response.message,
          operations: JSON.stringify(response.operations),
          reasoning: reasoning || null,
          createdAt: new Date(Date.now() + 1),
        },
        select: {
          id: true,
          role: true,
          content: true,
          reasoning: true,
          createdAt: true,
        },
      });
      return {
        conversationId: conversation.id,
        messages: [userMessage, assistantMessage],
      };
    });

  app.get(
    "/drawings/:id/ai/conversation",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!canViewDrawing(await getAccess(req, req.params.id))) {
        return notFound(res);
      }
      const conversation = await prisma.aiConversation.findUnique({
        where: { drawingId: req.params.id },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
              id: true,
              role: true,
              content: true,
              reasoning: true,
              createdAt: true,
            },
          },
        },
      });
      if (!conversation)
        return res.json({ conversationId: null, messages: [] });
      return res.json({
        conversationId: conversation.id,
        messages: conversation.messages.reverse(),
      });
    }),
  );

  app.get(
    "/drawings/:id/ai/events",
    requireAuth,
    asyncHandler(async (req, res) => {
      const drawingId = req.params.id;
      if (!canViewDrawing(await getAccess(req, drawingId))) {
        return notFound(res);
      }
      res.status(200).set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      let eventQueue: Promise<void> = Promise.resolve();
      const enqueue = (task: () => Promise<void>) => {
        eventQueue = eventQueue.then(task).catch(() => {
          // Fail closed if access cannot be revalidated.
          if (!res.writableEnded && !res.destroyed) res.end();
        });
      };
      const withViewAccess = async (write: () => void) => {
        if (res.writableEnded || res.destroyed) return;
        let allowed = false;
        try {
          allowed = canViewDrawing(await getAccess(req, drawingId));
        } catch {
          // A transient authorization error must not leave a stale stream open.
        }
        if (!allowed) {
          if (!res.writableEnded && !res.destroyed) res.end();
          return;
        }
        if (!res.writableEnded && !res.destroyed) write();
      };
      const unsubscribe = eventHub.subscribe(drawingId, (event) => {
        enqueue(() =>
          withViewAccess(() => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }),
        );
      });
      enqueue(() =>
        withViewAccess(() => {
          res.write(
            `data: ${JSON.stringify({
              type: "snapshot",
              job: eventHub.getActiveJob(drawingId),
            })}\n\n`,
          );
        }),
      );
      const heartbeat = setInterval(() => {
        enqueue(() =>
          withViewAccess(() => {
            res.write(": keepalive\n\n");
          }),
        );
      }, 25000);
      res.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    }),
  );

  app.post(
    "/drawings/:id/ai/messages",
    requireAuth,
    asyncHandler(async (req, res) => {
      const prepared = await prepareMessageRequest(req, res);
      if (!prepared) return;
      const job = eventHub.startJob(prepared.drawingId);
      if (!job) {
        return res.status(409).json({
          error: "AI already working",
          message: "Wait for the current board AI request to finish",
        });
      }

      try {
        let aiResponse;
        try {
          aiResponse = await requestKimi(
            { ...kimi, apiKey: kimi.apiKey! },
            prepared.history,
            prepared.boardContext,
            prepared.message,
          );
        } catch (error) {
          if (error instanceof KimiClientError) {
            return res.status(error.statusCode).json({
              error: "AI request failed",
              message: error.message,
            });
          }
          throw error;
        }

        if (!hasValidOperationTargets(aiResponse, prepared.boardContext)) {
          return res.status(502).json({
            error: "Invalid AI response",
            message: "Kimi returned board operations that could not be applied",
          });
        }
        if (!canEditDrawing(await getAccess(req, prepared.drawingId))) {
          return notFound(res);
        }
        const saved = await saveExchange(
          prepared.drawingId,
          prepared.message,
          aiResponse,
          job.reasoning,
        );
        eventHub.publish(prepared.drawingId, {
          type: "messages",
          messages: saved.messages,
        });
        return res.json({ ...saved, operations: aiResponse.operations });
      } finally {
        eventHub.finishJob(prepared.drawingId, job.id);
      }
    }),
  );

  app.post(
    "/drawings/:id/ai/messages/stream",
    requireAuth,
    asyncHandler(async (req, res) => {
      const prepared = await prepareMessageRequest(req, res);
      if (!prepared) return;
      const job = eventHub.startJob(prepared.drawingId);
      if (!job) {
        return res.status(409).json({
          error: "AI already working",
          message: "Wait for the current board AI request to finish",
        });
      }

      const abortController = new AbortController();
      const handleClose = () => {
        if (!res.writableEnded) abortController.abort();
      };
      res.on("close", handleClose);
      res.status(200).set({
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();

      const writeEvent = (event: Record<string, unknown>) => {
        if (
          res.writableEnded ||
          res.destroyed ||
          abortController.signal.aborted
        )
          return;
        res.write(`${JSON.stringify(event)}\n`);
      };
      let reasoningQueue: Promise<void> = Promise.resolve();
      const queueReasoning = (text: string) => {
        reasoningQueue = reasoningQueue
          .then(async () => {
            if (abortController.signal.aborted) return;
            let allowed = false;
            try {
              allowed = canEditDrawing(
                await getAccess(req, prepared.drawingId),
              );
            } catch {
              // Fail closed if access cannot be revalidated.
            }
            if (!allowed) {
              writeEvent({
                type: "error",
                message: "You no longer have permission to edit this drawing",
              });
              abortController.abort();
              return;
            }
            eventHub.appendReasoning(prepared.drawingId, job.id, text);
            writeEvent({ type: "reasoning", text });
          })
          .catch(() => abortController.abort());
      };

      try {
        const aiResponse = await streamKimi(
          { ...kimi, apiKey: kimi.apiKey! },
          prepared.history,
          prepared.boardContext,
          prepared.message,
          queueReasoning,
          abortController.signal,
        );
        await reasoningQueue;
        if (abortController.signal.aborted) return;
        if (!hasValidOperationTargets(aiResponse, prepared.boardContext)) {
          throw new KimiClientError(
            "Kimi returned board operations that could not be applied",
          );
        }
        if (!canEditDrawing(await getAccess(req, prepared.drawingId))) {
          writeEvent({
            type: "error",
            message: "You no longer have permission to edit this drawing",
          });
          return;
        }
        const saved = await saveExchange(
          prepared.drawingId,
          prepared.message,
          aiResponse,
          job.reasoning,
        );
        eventHub.publish(prepared.drawingId, {
          type: "messages",
          messages: saved.messages,
        });
        writeEvent({
          type: "done",
          ...saved,
          operations: aiResponse.operations,
        });
      } catch (error) {
        if (!abortController.signal.aborted) {
          writeEvent({
            type: "error",
            message:
              error instanceof KimiClientError
                ? error.message
                : "The AI request could not be completed",
          });
          if (!(error instanceof KimiClientError)) {
            console.error("[AI] Streaming request failed", error);
          }
        }
      } finally {
        await reasoningQueue;
        eventHub.finishJob(prepared.drawingId, job.id);
        res.removeListener("close", handleClose);
        if (!res.writableEnded) res.end();
      }
    }),
  );

  app.delete(
    "/drawings/:id/ai/conversation",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!canEditDrawing(await getAccess(req, req.params.id))) {
        return notFound(res);
      }
      await prisma.aiConversation.deleteMany({
        where: { drawingId: req.params.id },
      });
      eventHub.publish(req.params.id, { type: "cleared" });
      return res.json({ success: true });
    }),
  );
};
