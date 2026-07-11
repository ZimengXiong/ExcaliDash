import React, { useCallback, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import {
  completeChatGptConnect,
  startChatGptConnect,
  type ChatGptConnectionStatus,
} from "../../api/chatgpt";

const STR = {
  heading: "ChatGPT (your subscription)",
  intro:
    "Connect your own ChatGPT Plus/Pro account. Requests run on your subscription — no API key needed. Your login stays on the server and is never shown here.",
  reconnect:
    "Your ChatGPT connection expired. Reconnect to keep using the assistant.",
  connect: "Connect ChatGPT",
  opening: "Opening ChatGPT…",
  step2:
    "A ChatGPT tab opened. After you approve, your browser lands on a localhost page that fails to load — that is expected. Copy that page's full URL from the address bar and paste it below.",
  pasteLabel: "Paste the redirect URL",
  pastePlaceholder: "http://localhost:1455/auth/callback?code=…&state=…",
  finish: "Finish connecting",
  finishing: "Connecting…",
  unofficial:
    "Unofficial channel: this uses the Codex sign-in flow. OpenAI may change or block it at any time.",
} as const;

type ChatGptConnectProps = {
  needsReconnect: boolean;
  onConnected: (status: ChatGptConnectionStatus) => void;
};

export const ChatGptConnect: React.FC<ChatGptConnectProps> = ({
  needsReconnect,
  onConnected,
}) => {
  const [phase, setPhase] = useState<"idle" | "starting" | "await-paste" | "finishing">(
    "idle",
  );
  const [redirectUrl, setRedirectUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setError(null);
    setPhase("starting");
    try {
      const { authorizeUrl } = await startChatGptConnect();
      window.open(authorizeUrl, "_blank", "noopener,noreferrer");
      setPhase("await-paste");
    } catch {
      setError("Could not start the ChatGPT sign-in. Try again.");
      setPhase("idle");
    }
  }, []);

  const handleFinish = useCallback(async () => {
    const value = redirectUrl.trim();
    if (!value) return;
    setError(null);
    setPhase("finishing");
    try {
      const status = await completeChatGptConnect(value);
      if (!status.connected) {
        setError("That link did not complete the sign-in. Start again.");
        setPhase("idle");
        return;
      }
      onConnected(status);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { message?: string } } }).response?.data
              ?.message ?? null)
          : null;
      setError(message || "Could not complete the sign-in. Start again.");
      setPhase("idle");
    }
  }, [redirectUrl, onConnected]);

  return (
    <div className="p-4 text-sm text-gray-700 dark:text-gray-300">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100">
        {STR.heading}
      </h3>
      {needsReconnect ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 p-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {STR.reconnect}
        </p>
      ) : (
        <p className="mt-2 text-gray-600 dark:text-gray-400">{STR.intro}</p>
      )}

      {phase === "await-paste" || phase === "finishing" ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-600 dark:text-gray-400">{STR.step2}</p>
          <label className="block text-xs font-medium">{STR.pasteLabel}</label>
          <textarea
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            rows={2}
            placeholder={STR.pastePlaceholder}
            className="w-full resize-none rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-2 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={phase === "finishing" || redirectUrl.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {phase === "finishing" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            {phase === "finishing" ? STR.finishing : STR.finish}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={phase === "starting"}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {phase === "starting" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ExternalLink size={14} />
          )}
          {phase === "starting" ? STR.opening : STR.connect}
        </button>
      )}

      {error ? (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <p className="mt-4 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
        {STR.unofficial}
      </p>
    </div>
  );
};
