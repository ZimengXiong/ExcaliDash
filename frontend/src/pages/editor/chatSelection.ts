const CHAT_SELECTION_STORAGE_KEY = "excalidash:ai-chat-selection";

export type ChatSelection = {
  providerId: string;
  modelId: string;
};

export const loadChatSelection = (): ChatSelection => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CHAT_SELECTION_STORAGE_KEY) ?? "{}",
    );
    return {
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : "",
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
    };
  } catch {
    return { providerId: "", modelId: "" };
  }
};

export const saveChatSelection = (selection: ChatSelection): void => {
  try {
    window.localStorage.setItem(
      CHAT_SELECTION_STORAGE_KEY,
      JSON.stringify(selection),
    );
  } catch {
    // The in-memory selection remains usable when storage is unavailable.
  }
};
