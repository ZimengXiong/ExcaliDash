import crypto from "crypto";

export type AiActiveJob = {
  id: string;
  reasoning: string;
  startedAt: string;
};

export type AiConversationEvent =
  | { type: "messages"; messages: unknown[] }
  | { type: "cleared" }
  | {
      type: "status";
      status: "working" | "idle";
      jobId: string;
      reasoning?: string;
    };

type Listener = (event: AiConversationEvent) => void;

export const createAiEventHub = () => {
  const listeners = new Map<string, Set<Listener>>();
  const activeJobs = new Map<string, AiActiveJob>();

  const subscribe = (drawingId: string, listener: Listener) => {
    const room = listeners.get(drawingId) ?? new Set<Listener>();
    room.add(listener);
    listeners.set(drawingId, room);
    return () => {
      room.delete(listener);
      if (room.size === 0) listeners.delete(drawingId);
    };
  };

  const publish = (drawingId: string, event: AiConversationEvent) => {
    for (const listener of listeners.get(drawingId) ?? []) listener(event);
  };

  const getActiveJob = (drawingId: string) => activeJobs.get(drawingId) ?? null;

  const startJob = (drawingId: string): AiActiveJob | null => {
    if (activeJobs.has(drawingId)) return null;
    const job = {
      id: crypto.randomUUID(),
      reasoning: "",
      startedAt: new Date().toISOString(),
    };
    activeJobs.set(drawingId, job);
    publish(drawingId, {
      type: "status",
      status: "working",
      jobId: job.id,
      reasoning: "",
    });
    return job;
  };

  const appendReasoning = (drawingId: string, jobId: string, text: string) => {
    const job = activeJobs.get(drawingId);
    if (!job || job.id !== jobId) return;
    job.reasoning += text;
    publish(drawingId, {
      type: "status",
      status: "working",
      jobId,
      reasoning: job.reasoning,
    });
  };

  const finishJob = (drawingId: string, jobId: string) => {
    const job = activeJobs.get(drawingId);
    if (!job || job.id !== jobId) return;
    activeJobs.delete(drawingId);
    publish(drawingId, { type: "status", status: "idle", jobId });
  };

  return {
    subscribe,
    publish,
    getActiveJob,
    startJob,
    appendReasoning,
    finishJob,
  };
};
