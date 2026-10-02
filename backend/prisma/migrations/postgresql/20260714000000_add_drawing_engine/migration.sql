-- Per-drawing rendering engine. "excalidraw" (default) keeps every existing row
-- and client behaving exactly as before; "tldraw" opts a drawing into the
-- tldraw editor. Immutable after creation (enforced in the API layer).
ALTER TABLE "Drawing" ADD COLUMN "engine" TEXT NOT NULL DEFAULT 'excalidraw';
