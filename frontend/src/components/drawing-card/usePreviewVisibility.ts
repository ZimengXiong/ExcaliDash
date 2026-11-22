import { useEffect, useRef, useState } from "react";

const visibilityCallbacks = new Map<Element, (isVisible: boolean) => void>();
let observer: IntersectionObserver | undefined;

export const usePreviewVisibility = (initiallyVisible = false) => {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(initiallyVisible);
  const [hasBeenNearViewport, setHasBeenNearViewport] =
    useState(initiallyVisible);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      setHasBeenNearViewport(true);
      return;
    }

    const previewObserver = (observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibilityCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin: "320px 0px" },
    ));
    visibilityCallbacks.set(container, (isVisible) => {
      setIsNearViewport(isVisible);
      if (isVisible) setHasBeenNearViewport(true);
    });
    previewObserver.observe(container);
    return () => {
      visibilityCallbacks.delete(container);
      previewObserver.unobserve(container);
      if (visibilityCallbacks.size === 0) {
        previewObserver.disconnect();
        observer = undefined;
      }
    };
  }, []);

  return { previewContainerRef, isNearViewport, hasBeenNearViewport };
};
