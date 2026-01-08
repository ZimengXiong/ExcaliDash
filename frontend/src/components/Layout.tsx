import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { UploadStatus } from './UploadStatus';
import type { Collection } from '../types';

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
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Handle mouse down on resize handle
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(200, Math.min(600, startWidthRef.current + diff));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', () => {});
      document.removeEventListener('mouseup', () => {});
    };
  }, []);

  return (
    <div className="h-screen w-full bg-[#F3F4F6] dark:bg-neutral-950 p-4 transition-colors duration-200 overflow-hidden">
      <div className="flex gap-4 items-start h-full">
        <aside 
          ref={sidebarRef}
          className="flex-shrink-0 h-full bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] overflow-hidden z-20 transition-colors duration-200 relative"
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
          
          {/* Resize Handle */}
          <div
            className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-all duration-150 ${isResizing ? 'bg-indigo-500 dark:bg-indigo-400 w-2' : ''} group`}
            onMouseDown={handleMouseDown}
            title="Drag to resize sidebar"
          >
            <div className="absolute inset-y-0 -left-0.5 -right-0.5 bg-transparent hover:bg-indigo-500/10 dark:hover:bg-indigo-400/10 transition-colors duration-150" />
          </div>
        </aside>
        <main className="flex-1 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-neutral-800/50 shadow-sm h-full transition-colors duration-200 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto p-6 lg:p-8 min-h-full">
            {children}
          </div>
        </main>
      </div>
      <UploadStatus />
    </div>
  );
};
