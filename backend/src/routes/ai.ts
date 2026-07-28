import express from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const AI_SYSTEM_PROMPT =
  "You are a diagram assistant that converts text descriptions into Mermaid diagram syntax. " +
  "Output ONLY valid Mermaid syntax. Do not include markdown code fences, explanations, or any text outside the diagram.";

export const registerAiRoutes = (app: express.Express): void => {
  const apiKey = (process.env.AI_API_KEY || "").trim();
  const baseUrl = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const model = (process.env.AI_MODEL || "anthropic/claude-sonnet-4-6").trim();

  app.post(
    "/ai/text-to-diagram/generate",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!apiKey) {
        res.status(503).json({ error: "AI feature is not configured" });
        return;
      }

      const { prompt } = req.body as { prompt?: unknown };
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        res.status(400).json({ error: "prompt is required" });
        return;
      }

      const aiRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: AI_SYSTEM_PROMPT },
            { role: "user", content: prompt.trim() },
          ],
        }),
      });

      if (!aiRes.ok) {
        const body = await aiRes.text().catch(() => "");
        console.error(`[AI] upstream error ${aiRes.status}:`, body);
        res.status(502).json({ error: "AI service returned an error" });
        return;
      }

      const data = (await aiRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const generatedResponse = data.choices?.[0]?.message?.content ?? "";

      res.json({ generatedResponse });
    }),
  );
};
