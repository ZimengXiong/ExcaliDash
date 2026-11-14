import React, { useRef } from "react";

type InlineEditInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onBlur" | "onSubmit"
> & {
  /** Called once when the edit is confirmed: Enter, or focus leaving the input. */
  onCommit: () => void;
  /** Called once when the edit is abandoned with Escape. */
  onCancel: () => void;
};

/**
 * Text input for renaming in place. Enter and blur (clicking away) both commit,
 * Escape cancels. Only the first of these events counts, so Enter followed by
 * the blur that comes from closing the input never saves twice, and Escape
 * followed by a blur never saves at all. The input is mounted per edit, so the
 * "already finished" flag resets for every new edit.
 */
export const InlineEditInput: React.FC<InlineEditInputProps> = ({
  onCommit,
  onCancel,
  onKeyDown,
  ...inputProps
}) => {
  const finishedRef = useRef(false);

  const finish = (action: () => void) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    action();
  };

  return (
    <input
      type="text"
      autoFocus
      {...inputProps}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          finish(onCommit);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(onCancel);
        }
      }}
      onBlur={() => finish(onCommit)}
    />
  );
};
