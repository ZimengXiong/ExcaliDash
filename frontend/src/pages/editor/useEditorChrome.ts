import { useEffect, useState } from "react";
import throttle from "lodash/throttle";

type UseEditorChromeOptions = {
  drawingName: string;
  autoHideEnabled: boolean;
  isRenaming: boolean;
};

export const useEditorChrome = ({
  drawingName,
  autoHideEnabled,
  isRenaming,
}: UseEditorChromeOptions) => {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  useEffect(() => {
    document.title = `${drawingName} - ExcaliDash`;
    return () => {
      document.title = "ExcaliDash";
    };
  }, [drawingName]);

  useEffect(() => {
    if (!autoHideEnabled || isRenaming) {
      setIsHeaderVisible(true);
      return;
    }

    let hideTimeout: ReturnType<typeof setTimeout> | null = null;
    let isInTriggerZone = false;

    const handleMouseMove = throttle((e: MouseEvent) => {
      const wasInTriggerZone = isInTriggerZone;
      isInTriggerZone = e.clientY < 5;

      if (isInTriggerZone) {
        setIsHeaderVisible(true);
        if (hideTimeout !== null) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      } else if (wasInTriggerZone) {
        if (hideTimeout !== null) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          setIsHeaderVisible(false);
        }, 2000);
      }
    }, 100);

    setIsHeaderVisible(true);
    hideTimeout = setTimeout(() => {
      setIsHeaderVisible(false);
    }, 3000);

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimeout !== null) clearTimeout(hideTimeout);
    };
  }, [autoHideEnabled, isRenaming]);

  return {
    isHeaderVisible,
    setIsHeaderVisible,
  };
};
