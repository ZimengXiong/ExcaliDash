import React from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Download,
  History,
  Loader2,
  Share2,
} from "lucide-react";
import clsx from "clsx";
import { Toaster } from "sonner";
import {
  LanguageSelector,
} from "../../components/LanguageSelector";
import { GridStepSelector } from "../../components/GridStepSelector";
import { ShareModal } from "../../components/ShareModal";
import { UserAvatar as ProfileAvatar } from "../../components/UserAvatar";
import type { UserIdentity } from "../../utils/identity";
import { UIOptions, validateEmbeddableUrl } from "./shared";

interface Peer extends UserIdentity {
  isActive: boolean;
}

type EditorViewProps = {
  id?: string;
  accessLevel: "none" | "view" | "edit" | "owner";
  autoHideEnabled: boolean;
  autosaveFailing: boolean;
  canEdit: boolean;
  drawingName: string;
  editorContainerRef: React.RefObject<HTMLDivElement>;
  initialData: any;
  isHeaderVisible: boolean;
  isHistoryOpen: boolean;
  historyButtonRef: React.RefObject<HTMLButtonElement>;
  isRenaming: boolean;
  isSavingOnLeave: boolean;
  isSceneLoading: boolean;
  langCode: string;
  loadError: string | null;
  me: UserIdentity;
  newName: string;
  peers: Peer[];
  theme: string;
  onBackClick: () => void;
  onCanvasChange: (elements: readonly any[], appState: any, files?: Record<string, any>) => void;
  onCanvasDropCapture: (event: React.DragEvent<HTMLDivElement>) => void;
  onExportClick: () => void;
  onLibraryChange: (items: readonly any[]) => void;
  onNavigateHome: () => void;
  onNewNameChange: (value: string) => void;
  onPointerUpdate: (payload: any) => void;
  onRenameBlur: () => void;
  onRenameStart: () => void;
  onRenameSubmit: (event: React.FormEvent) => void;
  onSetExcalidrawAPI: (api: any) => void;
  onSetLangCode: (langCode: string) => void;
  gridStep: number;
  onSetGridStep: (gridStep: number) => void;
  onShareOpen: () => void;
  isShareOpen: boolean;
  onCloseShare: () => void;
  onHistoryOpen: () => void;
  onToggleAutoHide: () => void;
};

const CollaboratorAvatar = ({
  user,
  label,
  inactive = false,
}: {
  user: UserIdentity;
  label: string;
  inactive?: boolean;
}) => (
  <div className="relative group" data-testid="collaborator-avatar">
    <ProfileAvatar
      name={user.name}
      size="toolbar"
      className={clsx("transition-all duration-300", inactive && "opacity-30 grayscale")}
    />
    <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
      {label}
    </div>
  </div>
);

export const EditorView: React.FC<EditorViewProps> = ({
  id,
  accessLevel,
  autoHideEnabled,
  autosaveFailing,
  canEdit,
  drawingName,
  editorContainerRef,
  initialData,
  isHeaderVisible,
  isHistoryOpen,
  historyButtonRef,
  isRenaming,
  isSavingOnLeave,
  isSceneLoading,
  langCode,
  loadError,
  me,
  newName,
  peers,
  theme,
  onBackClick,
  onCanvasChange,
  onCanvasDropCapture,
  onExportClick,
  onLibraryChange,
  onNavigateHome,
  onNewNameChange,
  onPointerUpdate,
  onRenameBlur,
  onRenameStart,
  onRenameSubmit,
  onSetExcalidrawAPI,
  onSetLangCode,
  gridStep,
  onSetGridStep,
  onShareOpen,
  isShareOpen,
  onCloseShare,
  onHistoryOpen,
  onToggleAutoHide,
}) => (
  <div className="h-screen flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
    <header
      className={clsx(
        "h-16 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 flex items-center px-4 justify-between z-10 fixed top-0 left-0 right-0 transition-all duration-300",
        isHeaderVisible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onBackClick}
          disabled={isSavingOnLeave}
          className={`flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-wait transition-all duration-200 ${isSavingOnLeave ? "pr-4" : ""}`}
        >
          {isSavingOnLeave ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">Saving changes...</span>
            </>
          ) : (
            <ArrowLeft size={20} />
          )}
        </button>
        {isRenaming ? (
          <form onSubmit={onRenameSubmit}>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onBlur={onRenameBlur}
              className="font-medium text-gray-900 dark:text-white bg-transparent px-2 py-1 border-2 border-indigo-500 rounded-md outline-none min-w-[200px]"
              style={{ width: `${Math.max(200, newName.length * 9 + 20)}px` }}
            />
          </form>
        ) : (
          <h1
            className="font-medium text-gray-900 dark:text-white px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded cursor-text"
            onDoubleClick={onRenameStart}
          >
            {drawingName}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        {canEdit && autosaveFailing ? (
          <span
            className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 border border-red-200 dark:border-red-800"
            title="Your recent changes could not be saved. Check your connection and try again."
            role="status"
          >
            <CloudOff size={14} />
            Unsaved changes
          </span>
        ) : null}
        {!canEdit ? (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
            Read-only
          </span>
        ) : null}
        {canEdit && id ? (
          <button
            ref={historyButtonRef}
            onClick={onHistoryOpen}
            className="ui-toolbar-button"
            title="Version History"
          >
            <History size={20} />
          </button>
        ) : null}
        {accessLevel === "owner" && id ? (
          <div className="relative inline-flex">
            <button
              onClick={onShareOpen}
              className="ui-toolbar-button"
              title="Share"
            >
              <Share2 size={20} />
            </button>
            <ShareModal
              drawingId={id}
              drawingName={drawingName}
              isOpen={isShareOpen}
              onClose={onCloseShare}
            />
          </div>
        ) : null}
        <button
          onClick={onToggleAutoHide}
          className="ui-toolbar-button"
          title={autoHideEnabled ? "Disable auto-hide" : "Enable auto-hide"}
        >
          {autoHideEnabled ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
        <button
          onClick={onExportClick}
          className="ui-toolbar-button"
          title="Export drawing"
        >
          <Download size={20} />
        </button>
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
        <div className="flex items-center">
          <CollaboratorAvatar user={me} label={`${me.name} (You)`} />
          {peers.length > 0 ? (
            <>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2" />
              <div className="flex items-center gap-2">
                {peers.map((peer) => (
                  <CollaboratorAvatar
                    key={peer.id}
                    user={peer}
                    label={peer.name}
                    inactive={!peer.isActive}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
    <div
      ref={editorContainerRef}
      className="relative w-full flex-1"
      onDropCapture={onCanvasDropCapture}
      style={{
        height: isHeaderVisible ? "calc(100vh - 4rem)" : "100vh",
        marginTop: isHeaderVisible ? "4rem" : "0",
      }}
    >
      {loadError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 px-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Unable to open drawing
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {loadError}
            </p>
          </div>
          <button
            onClick={onNavigateHome}
            className="ui-button-secondary px-4"
          >
            Back to dashboard
          </button>
        </div>
      ) : initialData ? (
        <Excalidraw
          key={id}
          theme={theme === "dark" ? "dark" : "light"}
          langCode={langCode}
          initialData={initialData}
          onChange={onCanvasChange}
          onPointerUpdate={onPointerUpdate}
          onLibraryChange={onLibraryChange}
          excalidrawAPI={onSetExcalidrawAPI}
          UIOptions={UIOptions}
          validateEmbeddable={validateEmbeddableUrl}
          viewModeEnabled={!canEdit || isHistoryOpen}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Help />
            <MainMenu.Separator />
            <MainMenu.ItemCustom>
              <GridStepSelector gridStep={gridStep} onChange={onSetGridStep} />
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <LanguageSelector langCode={langCode} onChange={onSetLangCode} />
            </MainMenu.ItemCustom>
          </MainMenu>
        </Excalidraw>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
          <span className="text-sm font-medium">
            {isSceneLoading ? "Loading drawing..." : "Preparing canvas..."}
          </span>
        </div>
      )}
      <Toaster position="bottom-center" />
    </div>
  </div>
);
