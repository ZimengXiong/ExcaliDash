/**
 * Excalidraw matches single-key shortcuts against `event.key` — the character
 * the layout produces, not the physical key (`findShapeByKey`). Under a
 * non-Latin layout that character never matches: on a Russian keyboard the
 * physical R key reports "к", so R/T/V/O and the rest of the toolbar stop
 * working. Upstream falls back to `event.code` for undo/redo only
 * (excalidraw PR #5944), which leaves the tools broken.
 *
 * Fix: in the capture phase — ahead of Excalidraw's own listener on
 * `.excalidraw-container` and of this app's window listeners — rewrite a
 * non-Latin `event.key` to the Latin letter that sits on the same physical
 * key, read from `event.code`. Going through `code` instead of a layout table
 * covers every non-Latin layout, not just Cyrillic.
 *
 * Typing is untouched: text fields (including Excalidraw's hidden textarea for
 * on-canvas labels) and IME composition are skipped, so Cyrillic text still
 * types as Cyrillic. Returns a cleanup that detaches the listener.
 */
const LETTER_CODE = /^Key([A-Z])$/;

const isLatinLetter = (key: string) => /^[a-z]$/i.test(key);

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
};

export const attachKeyboardLayoutFix = (
  target: Document | HTMLElement | null,
): (() => void) => {
  if (!target) return () => {};
  const handleKeyDown = (event: KeyboardEvent) => {
    // 229 is the legacy "IME is handling this" keyCode, still reported by
    // Windows IMEs that leave `isComposing` false
    if (event.isComposing || event.keyCode === 229) return;
    // alt shortcuts are left alone: Excalidraw matches all of them on
    // `event.code` already, and on macOS alt+letter is a character in its own
    // right (alt+r is "®"), which this has no business rewriting
    if (event.altKey) return;
    // a Latin character already matches; this also skips macOS, which
    // substitutes Latin into cmd shortcuts on its own
    if (event.key.length !== 1 || isLatinLetter(event.key)) return;
    const letter = LETTER_CODE.exec(event.code)?.[1];
    // letters only: punctuation shortcuts sit on different physical keys
    // across layouts, so there is no honest mapping for them
    if (!letter) return;
    if (isTypingTarget(event.target)) return;
    // keep the case: shift+к must arrive as "R", not "r", or the patch would
    // fire shortcuts that the English layout leaves alone
    const isUpperCase = event.key !== event.key.toLowerCase();
    try {
      Object.defineProperty(event, "key", {
        value: isUpperCase ? letter : letter.toLowerCase(),
        configurable: true,
      });
    } catch {
      // a browser that refuses to shadow the prototype getter keeps the
      // original key: shortcuts stay as broken as they are today, nothing else
      // changes
    }
  };
  target.addEventListener("keydown", handleKeyDown as EventListener, true);
  return () =>
    target.removeEventListener("keydown", handleKeyDown as EventListener, true);
};
