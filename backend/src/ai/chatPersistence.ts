import { v4 as uuidv4 } from "uuid";
import type { PrismaClient } from "../generated/client";
import type { ConversationTurn } from "./providers/types";

export type StoredChatMessageDto = {
  id: string;
  drawingId: string;
  turnId: string;
  clientRequestId?: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  status: "streaming" | "complete" | "error" | "interrupted";
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
  tools: unknown[];
  batches: unknown[];
  error?: string;
  opErrors: unknown[];
  author?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

type ChatRow = {
  id: string;
  drawingId: string;
  turnId: string;
  position: number;
  clientRequestId: string | null;
  role: string;
  content: string;
  thinking: string | null;
  status: string;
  providerId: string | null;
  model: string | null;
  reasoningEffort: string | null;
  tools: string;
  batches: string;
  error: string | null;
  opErrors: string;
  createdAt: Date;
  updatedAt: Date;
  authorUser?: { id: string; name: string } | null;
};

const parseArray = (raw: string): unknown[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const statusOf = (value: string): StoredChatMessageDto["status"] =>
  value === "streaming" || value === "error" || value === "interrupted"
    ? value
    : "complete";

export const toStoredChatMessageDto = (row: ChatRow): StoredChatMessageDto => ({
  id: row.id,
  drawingId: row.drawingId,
  turnId: row.turnId,
  ...(row.clientRequestId ? { clientRequestId: row.clientRequestId } : {}),
  role: row.role === "user" ? "user" : "assistant",
  text: row.content,
  ...(row.thinking ? { thinking: row.thinking } : {}),
  status: statusOf(row.status),
  ...(row.providerId ? { providerId: row.providerId } : {}),
  ...(row.model ? { model: row.model } : {}),
  ...(row.reasoningEffort ? { reasoningEffort: row.reasoningEffort } : {}),
  tools: parseArray(row.tools),
  batches: parseArray(row.batches),
  ...(row.error ? { error: row.error } : {}),
  opErrors: parseArray(row.opErrors),
  ...(row.authorUser ? { author: row.authorUser } : {}),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const rowInclude = { authorUser: { select: { id: true, name: true } } } as const;

export const loadStoredChatMessages = async (
  prisma: PrismaClient,
  drawingId: string,
  limit = 500,
): Promise<StoredChatMessageDto[]> => {
  const rows = await prisma.drawingChatMessage.findMany({
    where: { drawingId },
    orderBy: [{ createdAt: "desc" }, { position: "desc" }, { id: "desc" }],
    take: limit,
    include: rowInclude,
  });
  return rows.reverse().map(toStoredChatMessageDto);
};

export const interruptStaleChatMessages = async (
  prisma: PrismaClient,
  drawingId: string,
): Promise<void> => {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  await prisma.drawingChatMessage.updateMany({
    where: { drawingId, status: "streaming", updatedAt: { lt: staleBefore } },
    data: {
      status: "interrupted",
      error: "Generation was interrupted before it completed.",
    },
  });
};

export const createStoredChatTurn = async (params: {
  prisma: PrismaClient;
  drawingId: string;
  userId: string;
  text: string;
  clientRequestId: string;
  providerId: string;
  model?: string | null;
  reasoningEffort?: string | null;
}): Promise<{ user: StoredChatMessageDto; assistant: StoredChatMessageDto; created: boolean }> => {
  const existing = await params.prisma.drawingChatMessage.findUnique({
    where: { clientRequestId: params.clientRequestId },
    include: rowInclude,
  });
  if (existing) {
    if (existing.drawingId !== params.drawingId || existing.authorUserId !== params.userId) {
      throw new Error("CHAT_REQUEST_ID_CONFLICT");
    }
    const assistant = await params.prisma.drawingChatMessage.findFirstOrThrow({
      where: { turnId: existing.turnId, role: "assistant" },
      include: rowInclude,
    });
    return {
      user: toStoredChatMessageDto(existing),
      assistant: toStoredChatMessageDto(assistant),
      created: false,
    };
  }

  const turnId = uuidv4();
  const [user, assistant] = await params.prisma.$transaction([
    params.prisma.drawingChatMessage.create({
      data: {
        drawingId: params.drawingId,
        turnId,
        position: 0,
        authorUserId: params.userId,
        role: "user",
        content: params.text,
        clientRequestId: params.clientRequestId,
      },
      include: rowInclude,
    }),
    params.prisma.drawingChatMessage.create({
      data: {
        drawingId: params.drawingId,
        turnId,
        position: 1,
        role: "assistant",
        status: "streaming",
        providerId: params.providerId,
        model: params.model ?? null,
        reasoningEffort: params.reasoningEffort ?? null,
      },
      include: rowInclude,
    }),
  ]);
  return {
    user: toStoredChatMessageDto(user),
    assistant: toStoredChatMessageDto(assistant),
    created: true,
  };
};

export const finalizeStoredAssistant = async (params: {
  prisma: PrismaClient;
  id: string;
  text: string;
  thinking: string;
  status: "complete" | "error" | "interrupted";
  tools: unknown[];
  batches: unknown[];
  error?: string;
  opErrors?: unknown[];
  providerMetadata?: Record<string, unknown>;
}): Promise<StoredChatMessageDto> => {
  const row = await params.prisma.drawingChatMessage.update({
    where: { id: params.id },
    data: {
      content: params.text,
      thinking: params.thinking || null,
      status: params.status,
      tools: JSON.stringify(params.tools),
      batches: JSON.stringify(params.batches),
      error: params.error ?? null,
      opErrors: JSON.stringify(params.opErrors ?? []),
      providerMetadata: params.providerMetadata
        ? JSON.stringify(params.providerMetadata).slice(0, 1_000_000)
        : null,
    },
    include: rowInclude,
  });
  return toStoredChatMessageDto(row);
};

export const checkpointStoredAssistant = async (params: {
  prisma: PrismaClient;
  id: string;
  text: string;
  thinking: string;
  tools: unknown[];
  batches: unknown[];
}): Promise<void> => {
  await params.prisma.drawingChatMessage.update({
    where: { id: params.id },
    data: {
      content: params.text,
      thinking: params.thinking || null,
      tools: JSON.stringify(params.tools),
      batches: JSON.stringify(params.batches),
    },
  });
};

export const loadConversationHistory = async (params: {
  prisma: PrismaClient;
  drawingId: string;
  providerId: string;
  model?: string | null;
}): Promise<ConversationTurn[]> => {
  const rows = await params.prisma.drawingChatMessage.findMany({
    where: {
      drawingId: params.drawingId,
      OR: [{ role: "user" }, { role: "assistant", status: "complete" }],
    },
    orderBy: [{ createdAt: "desc" }, { position: "desc" }, { id: "desc" }],
    take: 100,
  });
  return rows.reverse().map((row): ConversationTurn => {
    if (row.role === "user") return { role: "user", text: row.content };
    let providerMetadata: Record<string, unknown> | undefined;
    if (row.providerId === params.providerId && row.model === params.model && row.providerMetadata) {
      try { providerMetadata = JSON.parse(row.providerMetadata); } catch { /* opaque state is optional */ }
    }
    return {
      role: "assistant",
      text: row.content,
      toolCalls: [],
      ...(providerMetadata ? { providerMetadata } : {}),
    };
  });
};
