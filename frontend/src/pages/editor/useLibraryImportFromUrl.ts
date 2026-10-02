import { useEffect } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import * as api from "../../api";

type UseLibraryImportFromUrlParams = {
  excalidrawAPIRef: RefObject<any>;
  isReady: boolean;
  user: unknown;
};

export const useLibraryImportFromUrl = ({
  excalidrawAPIRef,
  isReady,
  user,
}: UseLibraryImportFromUrlParams) => {
  useEffect(() => {
    if (!isReady || !excalidrawAPIRef.current) return;
    const hash = window.location.hash;
    if (!hash.includes("addLibrary=")) return;
    const params = new URLSearchParams(hash.slice(1));
    const libraryUrl = params.get("addLibrary");
    if (!libraryUrl) return;
    const importLibraryFromUrl = async () => {
      try {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(libraryUrl, window.location.href);
        } catch {
          throw new Error("Invalid library URL");
        }
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          throw new Error("Library URL must use http(s)");
        }
        const isLocalhost =
          parsedUrl.hostname === "localhost" ||
          parsedUrl.hostname === "127.0.0.1" ||
          parsedUrl.hostname === "::1";
        const isCrossOrigin = parsedUrl.origin !== window.location.origin;
        if (isCrossOrigin) {
          const ok = window.confirm(
            `Import library from external site?\n\n${parsedUrl.origin}\n\nOnly continue if you trust this source.`,
          );
          if (!ok) {
            toast.info("Library import canceled", { id: "library-import" });
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
            return;
          }
        }
        if (
          !import.meta.env.DEV &&
          parsedUrl.protocol === "http:" &&
          !isLocalhost
        ) {
          throw new Error("Insecure http:// library URL is not allowed");
        }
        toast.loading("Importing library...", { id: "library-import" });
        const response = await fetch(parsedUrl.toString(), {
          credentials: "omit",
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch library: ${response.statusText}`);
        }
        const blob = await response.blob();
        if (blob.size > 10 * 1024 * 1024) {
          throw new Error("Library file is too large");
        }
        await excalidrawAPIRef.current.updateLibrary({
          libraryItems: blob,
          merge: true,
          defaultStatus: "published",
          openLibraryMenu: true,
        });
        const updatedItems =
          excalidrawAPIRef.current.getAppState().libraryItems || [];
        if (user) {
          await api.updateLibrary([...updatedItems]);
        }
        toast.success("Library imported successfully", {
          id: "library-import",
        });
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      } catch (err) {
        console.error("[Editor] Failed to import library:", err);
        toast.error("Failed to import library", { id: "library-import" });
      }
    };
    importLibraryFromUrl();
  }, [excalidrawAPIRef, isReady, user]);
};
