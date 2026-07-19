import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Logo } from './Logo';
import { UploadStatus } from './UploadStatus';
import { ImpersonationBanner } from './ImpersonationBanner';
import { UpdateBanner } from './UpdateBanner';
import type { Collection } from '../types';
import clsx from 'clsx';
import { displayFontFamily } from "../utils/displayFont";

interface LayoutProps {
  children: React.ReactNode;
  collections: Collection[];
  selectedCollectionId: string | null | undefined;
  onSelectCollection: (id: string | null | undefined) => void;
  onCreateCollection: (name: string) => void;
  onEditCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onDrop?: (e: React.DragEvent, collectionId: string | null) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  collections,
  selectedCollectionId,
  onSelectCollection,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onDrop
}) => {
  const location = useLocation();
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const resizeMouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const resizeMouseUpHandlerRef = useRef<(() => void) | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;

    if (resizeMouseMoveHandlerRef.current) {
      document.removeEventListener('mousemove', resizeMouseMoveHandlerRef.current);
    }
    if (resizeMouseUpHandlerRef.current) {
      document.removeEventListener('mouseup', resizeMouseUpHandlerRef.current);
    }

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(200, Math.min(600, startWidthRef.current + diff));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      resizeMouseMoveHandlerRef.current = null;
      resizeMouseUpHandlerRef.current = null;
    };

    resizeMouseMoveHandlerRef.current = handleMouseMove;
    resizeMouseUpHandlerRef.current = handleMouseUp;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      if (resizeMouseMoveHandlerRef.current) {
        document.removeEventListener('mousemove', resizeMouseMoveHandlerRef.current);
        resizeMouseMoveHandlerRef.current = null;
      }
      if (resizeMouseUpHandlerRef.current) {
        document.removeEventListener('mouseup', resizeMouseUpHandlerRef.current);
        resizeMouseUpHandlerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const sync = () => {
      setIsMobile(mq.matches);
      setIsSidebarOpen(!mq.matches);
    };

    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    setIsSidebarOpen(false);
  }, [isMobile, location.pathname, location.search]);

  return (
    <div className="h-screen w-full bg-[#F3F4F6] dark:bg-neutral-950 p-2 sm:p-4 transition-colors duration-200 overflow-hidden">
      {isMobile ? (
        <div className="relative h-full min-w-0">
          <main className="h-full min-w-0 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-neutral-800/50 shadow-sm transition-colors duration-200 overflow-hidden flex flex-col">
            <div className="h-16 flex-shrink-0 flex items-center px-4 border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(v => !v)}
                className="inline-flex items-center justify-center h-11 w-11 rounded-xl border-2 border-slate-800 dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.18)] text-slate-900 dark:text-neutral-200 hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-none"
                title={isSidebarOpen ? 'Close menu' : 'Open menu'}
                aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
              >
                {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              <div className="ml-auto flex items-center gap-2">
                <Logo className="w-8 h-8" />
                <span className="text-xl text-slate-900 dark:text-white mt-1" style={{ fontFamily: displayFontFamily }}>ExcaliDash</span>
                <span className="text-[10px] font-bold text-red-500 mt-2" style={{ fontFamily: 'sans-serif' }}>BETA</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar">
              <div className="w-full mx-auto p-4 sm:p-6 lg:p-8 min-h-full">
                <UpdateBanner />
                <ImpersonationBanner />
                {children}
              </div>
            </div>
          </main>

          <div
            className={clsx(
              'fixed inset-0 z-30 bg-neutral-900/20 backdrop-blur-sm transition-opacity duration-150',
              isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            onClick={() => setIsSidebarOpen(false)}
          />

          <aside
            ref={sidebarRef}
            className={clsx(
              'fixed inset-y-4 left-2 sm:left-4 z-40 bg-white dark:bg-neutral-900 rounded-2xl border-2 border-slate-800 dark:border-neutral-700 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.18)] overflow-hidden transition-transform duration-200',
              isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'
            )}
            style={{ width: `${sidebarWidth}px` }}
          >
            <Sidebar
              collections={collections}
              selectedCollectionId={selectedCollectionId}
              onSelectCollection={onSelectCollection}
              onCreateCollection={onCreateCollection}
              onEditCollection={onEditCollection}
              onDeleteCollection={onDeleteCollection}
              onDrop={onDrop}
            />

            <div
              className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-all duration-150 ${isResizing ? 'bg-indigo-500 dark:bg-indigo-400 w-2' : ''} group`}
              onMouseDown={handleMouseDown}
              title="Drag to resize sidebar"
            >
              <div className="absolute inset-y-0 -left-0.5 -right-0.5 bg-transparent hover:bg-indigo-500/10 dark:hover:bg-indigo-400/10 transition-colors duration-150" />
            </div>
          </aside>
        </div>
      ) : (
        <div className="flex gap-3 sm:gap-4 items-start h-full min-w-0">
          <aside 
            ref={sidebarRef}
            className="flex-shrink-0 h-full bg-white dark:bg-neutral-900 rounded-2xl border-2 border-slate-800 dark:border-neutral-700 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.18)] overflow-hidden z-20 transition-colors duration-200 relative"
            style={{ width: `${sidebarWidth}px` }}
          >
            <Sidebar
              collections={collections}
              selectedCollectionId={selectedCollectionId}
              onSelectCollection={onSelectCollection}
              onCreateCollection={onCreateCollection}
              onEditCollection={onEditCollection}
              onDeleteCollection={onDeleteCollection}
              onDrop={onDrop}
            />
            
            <div
              className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-all duration-150 ${isResizing ? 'bg-indigo-500 dark:bg-indigo-400 w-2' : ''} group`}
              onMouseDown={handleMouseDown}
              title="Drag to resize sidebar"
            >
              <div className="absolute inset-y-0 -left-0.5 -right-0.5 bg-transparent hover:bg-indigo-500/10 dark:hover:bg-indigo-400/10 transition-colors duration-150" />
            </div>
          </aside>
          <main className="flex-1 min-w-0 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-neutral-800/50 shadow-sm h-full transition-colors duration-200 overflow-y-auto no-scrollbar">
            <div className="w-full mx-auto p-4 sm:p-6 lg:p-8 min-h-full">
              <UpdateBanner />
              <ImpersonationBanner />
              {children}
            </div>
          </main>
        </div>
      )}
      <UploadStatus />
    </div>
  );
};
