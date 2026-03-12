'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { VideoClip, LibraryItem } from '@/types/video';

interface LeftSidebarProps {
  onVideoAdd?: (file: File) => string | void;
  onSubtitleImport?: (file: File) => void;
  clips?: VideoClip[];
  libraryItems?: LibraryItem[];
  selectedLibraryIds?: string[];
  onLibrarySelect?: (ids: string[]) => void;
  onLibraryDelete?: (ids: string[]) => void;
}

function isSubtitleFile(file: File): boolean {
  const ext = file.name.toLowerCase().split('.').pop();
  return ext === 'srt' || ext === 'ass' || ext === 'ssa';
}

function useVideoThumbnail(url: string, type: string): string | null {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!url || type !== 'video') return;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = 1;
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, 160, 90);
          setThumb(canvas.toDataURL('image/jpeg', 0.7));
        }
      } catch { /* ignore */ }
    };
    return () => { video.src = ''; };
  }, [url, type]);
  return thumb;
}

interface ThumbnailItemProps {
  item: LibraryItem;
  isSelected: boolean;
  selectedCount: number;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, item: LibraryItem) => void;
  itemRef: (el: HTMLDivElement | null) => void;
}

function ThumbnailItem({ item, isSelected, selectedCount, onSelect, onDragStart, itemRef }: ThumbnailItemProps) {
  const thumbnail = useVideoThumbnail(item.url, item.type);
  const isVideo = item.type === 'video';
  const isAudio = item.type === 'audio';
  const isImage = item.type === 'image';

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={itemRef}
      data-item-id={item.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onMouseDown={(e) => e.stopPropagation()}
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className={`relative group rounded-lg overflow-hidden border transition-all duration-150 hover:scale-[1.03] active:scale-95 cursor-grab active:cursor-grabbing ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-gray-600'
        }`}
      title={item.name}
    >
      <div className="aspect-video bg-gray-800 flex items-center justify-center">
        {isVideo && thumbnail ? (
          <img src={thumbnail} alt={item.name} className="w-full h-full object-cover" />
        ) : isImage ? (
          <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
        ) : isVideo ? (
          <span className="material-icons text-gray-500 text-3xl">movie</span>
        ) : isAudio ? (
          <div className="w-full h-full bg-gradient-to-br from-purple-900/50 to-gray-800 flex items-center justify-center">
            <span className="material-icons text-purple-400 text-3xl">music_note</span>
          </div>
        ) : (
          <span className="material-icons text-gray-500 text-3xl">insert_drive_file</span>
        )}

        {item.duration > 0 && !isImage && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] text-white px-1 rounded">
            {formatDuration(item.duration)}
          </span>
        )}

        {isSelected && (
          <span className="absolute top-1 left-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
            <span className="material-icons text-black text-[14px]">check</span>
          </span>
        )}

        {isSelected && selectedCount > 1 && (
          <span className="absolute top-1 right-1 min-w-[20px] h-5 bg-primary text-black text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {selectedCount}
          </span>
        )}
      </div>

      <div className="px-1.5 py-1 bg-panel-bg">
        <p className="text-[10px] text-gray-300 truncate">{item.name}</p>
      </div>
    </div>
  );
}

/* ───── helper: 두 사각형이 겹치는지 ───── */
function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export default function LeftSidebar({ onVideoAdd, onSubtitleImport, libraryItems = [], selectedLibraryIds = [], onLibrarySelect, onLibraryDelete }: LeftSidebarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastClickedIndexRef = useRef<number>(-1);

  // Lasso selection state
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoCurrent, setLassoCurrent] = useState<{ x: number; y: number } | null>(null);
  const lassoBaseSelection = useRef<string[]>([]);

  // Handle Delete key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedLibraryIds.length === 0) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onLibraryDelete?.(selectedLibraryIds);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedLibraryIds, onLibraryDelete]);

  // Ctrl/Cmd+A select all
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (libraryItems.length === 0) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        onLibrarySelect?.(libraryItems.map(i => i.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [libraryItems, onLibrarySelect]);

  // Lasso: pointer events (like Timeline) — completely separate from native drag
  useEffect(() => {
    if (!lassoStart) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setLassoCurrent({ x, y });

      const lassoRect = {
        left: Math.min(lassoStart.x, x),
        top: Math.min(lassoStart.y, y),
        right: Math.max(lassoStart.x, x),
        bottom: Math.max(lassoStart.y, y),
      };

      const hitIds: string[] = [];
      const gridRect = gridRef.current.getBoundingClientRect();
      itemRefs.current.forEach((el, id) => {
        const elRect = el.getBoundingClientRect();
        const itemBox = {
          left: elRect.left - gridRect.left,
          top: elRect.top - gridRect.top,
          right: elRect.right - gridRect.left,
          bottom: elRect.bottom - gridRect.top,
        };
        if (rectsOverlap(lassoRect, itemBox)) {
          hitIds.push(id);
        }
      });

      const merged = new Set([...lassoBaseSelection.current, ...hitIds]);
      onLibrarySelect?.(Array.from(merged));
    };

    const handlePointerUp = () => {
      setLassoStart(null);
      setLassoCurrent(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [lassoStart, libraryItems, onLibrarySelect]);

  const handleGridPointerDown = useCallback((e: React.PointerEvent) => {
    // Only start lasso on left click, on empty grid background
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-item-id]')) return;
    if (!gridRef.current) return;

    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    lassoBaseSelection.current = (e.metaKey || e.ctrlKey) ? [...selectedLibraryIds] : [];
    setLassoStart({ x, y });
    setLassoCurrent({ x, y });

    if (!e.metaKey && !e.ctrlKey) {
      onLibrarySelect?.([]);
    }
  }, [selectedLibraryIds, onLibrarySelect]);

  // Multi-select handler
  const handleItemSelect = useCallback((e: React.MouseEvent, index: number) => {
    const item = libraryItems[index];
    if (!item) return;

    if (e.shiftKey && lastClickedIndexRef.current >= 0) {
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      const rangeIds = libraryItems.slice(start, end + 1).map(i => i.id);
      if (e.metaKey || e.ctrlKey) {
        const merged = new Set([...selectedLibraryIds, ...rangeIds]);
        onLibrarySelect?.(Array.from(merged));
      } else {
        onLibrarySelect?.(rangeIds);
      }
    } else if (e.metaKey || e.ctrlKey) {
      if (selectedLibraryIds.includes(item.id)) {
        onLibrarySelect?.(selectedLibraryIds.filter(id => id !== item.id));
      } else {
        onLibrarySelect?.([...selectedLibraryIds, item.id]);
      }
      lastClickedIndexRef.current = index;
    } else {
      onLibrarySelect?.([item.id]);
      lastClickedIndexRef.current = index;
    }
  }, [libraryItems, selectedLibraryIds, onLibrarySelect]);

  // Drag start: carry all selected items
  const handleItemDragStart = useCallback((e: React.DragEvent, item: LibraryItem) => {
    const isItemSelected = selectedLibraryIds.includes(item.id);
    const dragIds = isItemSelected && selectedLibraryIds.length > 1
      ? selectedLibraryIds
      : [item.id];

    const dragItems = dragIds
      .map(id => libraryItems.find(li => li.id === id))
      .filter(Boolean)
      .map(li => ({
        id: li!.id,
        name: li!.name,
        type: li!.type,
        duration: li!.duration,
        url: li!.url,
      }));

    if (dragItems.length === 1) {
      e.dataTransfer.setData('application/library-item', JSON.stringify(dragItems[0]));
    } else {
      e.dataTransfer.setData('application/library-items', JSON.stringify(dragItems));
    }
    e.dataTransfer.effectAllowed = 'copy';

    if (!isItemSelected) {
      onLibrarySelect?.([item.id]);
      lastClickedIndexRef.current = libraryItems.indexOf(item);
    }
  }, [selectedLibraryIds, libraryItems, onLibrarySelect]);

  // Route files and collect added IDs to auto-select them
  const addFilesAndSelect = useCallback((files: File[]) => {
    const addedIds: string[] = [];
    for (const file of files) {
      if (isSubtitleFile(file)) {
        onSubtitleImport?.(file);
      } else {
        const id = onVideoAdd?.(file);
        if (id) addedIds.push(id);
      }
    }
    if (addedIds.length > 0) {
      onLibrarySelect?.(addedIds);
    }
  }, [onVideoAdd, onSubtitleImport, onLibrarySelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addFilesAndSelect(files);
  }, [addFilesAndSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFilesAndSelect(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFilesAndSelect]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Compute lasso rectangle for rendering
  const lassoRect = lassoStart && lassoCurrent ? {
    left: Math.min(lassoStart.x, lassoCurrent.x),
    top: Math.min(lassoStart.y, lassoCurrent.y),
    width: Math.abs(lassoCurrent.x - lassoStart.x),
    height: Math.abs(lassoCurrent.y - lassoStart.y),
  } : null;

  return (
    <aside className="w-full h-full flex flex-col border-r border-border-color bg-editor-bg">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*,.srt,.ass,.ssa"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Local</h2>
          <div className="flex items-center gap-2">
            {selectedLibraryIds.length > 1 && (
              <span className="text-[10px] text-primary font-medium">
                {selectedLibraryIds.length}개 선택
              </span>
            )}
            <button
              className="text-primary hover:text-white transition-all duration-200 relative group active:scale-90 hover:scale-110"
              title="Import History"
            >
              <span className="material-icons text-lg transition-transform duration-200 group-hover:rotate-180">history</span>
            </button>
          </div>
        </div>

        {/* Import Button */}
        <button
          onClick={handleImportClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`group w-full h-24 border border-dashed rounded-lg flex flex-col items-center justify-center transition-all mb-4 active:scale-95 hover:scale-[1.02] shrink-0 ${isDragging
            ? 'border-primary bg-primary/10 border-2'
            : 'border-border-color hover:border-primary bg-panel-bg'
            }`}
          title="Import Media"
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${isDragging
            ? 'bg-primary/30 scale-125'
            : 'bg-primary/10 group-hover:bg-primary/20'
            }`}>
            <span className={`material-icons text-primary text-xl transition-transform duration-200 ${isDragging ? 'animate-bounce' : 'group-hover:rotate-90'
              }`}>
              add
            </span>
          </div>
          <span className="text-[10px] text-gray-400 mt-1.5 group-hover:text-gray-300 transition-colors">
            {isDragging ? '파일을 놓아주세요' : '+ Import'}
          </span>
        </button>

        {/* Imported files thumbnail grid with lasso selection */}
        {libraryItems.length > 0 ? (
          <>
            <div
              ref={gridRef}
              className="grid grid-cols-2 gap-2 relative select-none"
              onPointerDown={handleGridPointerDown}
            >
              {libraryItems.map((item, idx) => (
                <ThumbnailItem
                  key={item.id}
                  item={item}
                  isSelected={selectedLibraryIds.includes(item.id)}
                  selectedCount={selectedLibraryIds.length}
                  onSelect={(e) => handleItemSelect(e, idx)}
                  onDragStart={handleItemDragStart}
                  itemRef={(el) => {
                    if (el) itemRefs.current.set(item.id, el);
                    else itemRefs.current.delete(item.id);
                  }}
                />
              ))}

              {/* Lasso rectangle overlay */}
              {lassoRect && lassoRect.width > 3 && lassoRect.height > 3 && (
                <div
                  className="absolute pointer-events-none border border-primary bg-primary/10 rounded-sm z-50"
                  style={{
                    left: lassoRect.left,
                    top: lassoRect.top,
                    width: lassoRect.width,
                    height: lassoRect.height,
                  }}
                />
              )}
            </div>
            {libraryItems.length > 1 && (
              <p className="text-[9px] text-gray-600 mt-3 text-center">
                드래그: 범위선택 | Ctrl/Cmd+클릭: 다중선택
              </p>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <span className="material-icons text-gray-600 text-4xl mb-2">video_library</span>
            <p className="text-xs text-gray-500">Import 버튼을 클릭하거나</p>
            <p className="text-xs text-gray-500">파일을 드래그하여 추가하세요</p>
          </div>
        )}
      </div>
    </aside>
  );
}
