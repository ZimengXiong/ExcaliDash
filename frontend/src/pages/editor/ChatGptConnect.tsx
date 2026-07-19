import React, { useCallback, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import {
  completeChatGptConnect,
  startChatGptConnect,
  type ChatGptConnectionStatus,
} from "../../api/chatgpt";

const STR = {
  heading: "Connect ChatGPT",
  intro: "Use your subscription—no API key.",
  reconnect: "Connection expired. Reconnect to continue.",
  connect: "Connect ChatGPT",
  opening: "Opening ChatGPT…",
  step2: "Approve in ChatGPT, then paste the URL from your address bar.",
  pasteLabel: "Redirect URL",
  pastePlaceholder: "http://localhost:1455/auth/callback?code=…&state=…",
  finish: "Finish connecting",
  finishing: "Connecting…",
  unofficial: "Uses Codex sign-in; availability may change.",
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
    <div className="p-4 text-sm text-slate-700 dark:text-neutral-300">
      <div className="ui-card-soft p-4">
      <h3 className="font-display text-xl text-slate-900 dark:text-white">
        {STR.heading}
      </h3>
      {needsReconnect ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {STR.reconnect}
        </p>
      ) : (
        <p className="mt-1 text-slate-500 dark:text-neutral-400">{STR.intro}</p>
      )}

      {phase === "await-paste" || phase === "finishing" ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-500 dark:text-neutral-400">{STR.step2}</p>
          <label className="ui-field-label block">{STR.pasteLabel}</label>
          <textarea
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            rows={2}
            placeholder={STR.pastePlaceholder}
            className="ui-input w-full resize-none text-xs"
          />
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={phase === "finishing" || redirectUrl.trim().length === 0}
            className="ui-button-primary"
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
          className="ui-button-primary mt-4"
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
    </div>
  );
};
