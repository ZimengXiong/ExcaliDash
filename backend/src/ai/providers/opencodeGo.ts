import { openCodeGoProtocolForModel } from "../providerDefinitions";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";
import { AiProviderError } from "./types";
import type {
  AiProviderAdapter,
  CompletionRequest,
  CompletionResult,
} from "./types";

/**
 * OpenCode Go exposes one base URL but currently routes some models through
 * OpenAI Chat Completions and others through Anthropic Messages. The official
 * catalog/docs determine the protocol; callers keep using the unprefixed API
 * model id returned by /models.
 */
export const opencodeGoAdapter: AiProviderAdapter = {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = req.settings.model ?? "";
    const protocol = openCodeGoProtocolForModel(model);
    if (!protocol) {
      throw new AiProviderError(
        `OpenCode Go model “${model}” does not have a reviewed protocol mapping`,
        400,
      );
    }
    return protocol === "anthropic-messages"
      ? anthropicAdapter.complete(req)
      : openaiAdapter.complete(req);
  },
};
