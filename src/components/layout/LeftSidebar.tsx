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

// Generate a thumbnail from a video URL
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
      } catch {
        // cross-origin or other error, ignore
      }
    };
    return () => {
      video.src = '';
    };
  }, [url, type]);
  return thumb;
}

interface ThumbnailItemProps {
  item: LibraryItem;
  isSelected: boolean;
  selectedCount: number;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, item: LibraryItem) => void;
}

function ThumbnailItem({ item, isSelected, selectedCount, onSelect, onDragStart }: ThumbnailItemProps) {
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
    <button
      onClick={onSelect}
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className={`relative group rounded-lg overflow-hidden border transition-all duration-150 hover:scale-[1.03] active:scale-95 cursor-grab active:cursor-grabbing ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-gray-600'
        }`}
      title={item.name}
    >
      {/* Thumbnail area */}
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

        {/* Duration badge */}
        {item.duration > 0 && !isImage && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] text-white px-1 rounded">
            {formatDuration(item.duration)}
          </span>
        )}

        {/* Selection checkbox */}
        {isSelected && (
          <span className="absolute top-1 left-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
            <span className="material-icons text-black text-[14px]">check</span>
          </span>
        )}

        {/* Multi-drag count badge */}
        {isSelected && selectedCount > 1 && (
          <span className="absolute top-1 right-1 min-w-[20px] h-5 bg-primary text-black text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {selectedCount}
          </span>
        )}
      </div>

      {/* File name */}
      <div className="px-1.5 py-1 bg-panel-bg">
        <p className="text-[10px] text-gray-300 truncate">{item.name}</p>
      </div>
    </button>
  );
}

export default function LeftSidebar({ onVideoAdd, onSubtitleImport, libraryItems = [], selectedLibraryIds = [], onLibrarySelect, onLibraryDelete }: LeftSidebarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastClickedIndexRef = useRef<number>(-1);

  // Handle Delete key for selected library items
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

  // Ctrl/Cmd+A to select all
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

  // Multi-select handler: Click, Ctrl/Cmd+Click, Shift+Click
  const handleItemSelect = useCallback((e: React.MouseEvent, index: number) => {
    const item = libraryItems[index];
    if (!item) return;

    if (e.shiftKey && lastClickedIndexRef.current >= 0) {
      // Shift+Click: range select
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      const rangeIds = libraryItems.slice(start, end + 1).map(i => i.id);
      // Merge with existing selection if Ctrl is also held
      if (e.metaKey || e.ctrlKey) {
        const merged = new Set([...selectedLibraryIds, ...rangeIds]);
        onLibrarySelect?.(Array.from(merged));
      } else {
        onLibrarySelect?.(rangeIds);
      }
    } else if (e.metaKey || e.ctrlKey) {
      // Ctrl/Cmd+Click: toggle single item
      if (selectedLibraryIds.includes(item.id)) {
        onLibrarySelect?.(selectedLibraryIds.filter(id => id !== item.id));
      } else {
        onLibrarySelect?.([...selectedLibraryIds, item.id]);
      }
      lastClickedIndexRef.current = index;
    } else {
      // Normal click: select only this item
      onLibrarySelect?.([item.id]);
      lastClickedIndexRef.current = index;
    }
  }, [libraryItems, selectedLibraryIds, onLibrarySelect]);

  // Drag start: carry all selected items (or just the dragged one)
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

    // Set both singular (backward compat) and plural data
    if (dragItems.length === 1) {
      e.dataTransfer.setData('application/library-item', JSON.stringify(dragItems[0]));
    } else {
      e.dataTransfer.setData('application/library-items', JSON.stringify(dragItems));
    }
    e.dataTransfer.effectAllowed = 'copy';

    // If dragging an unselected item, select it
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

  return (
    <aside className="w-full h-full flex flex-col border-r border-border-color bg-editor-bg">
      {/* Hidden file input */}
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

        {/* Imported files thumbnail grid */}
        {libraryItems.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {libraryItems.map((item, idx) => (
                <ThumbnailItem
                  key={item.id}
                  item={item}
                  isSelected={selectedLibraryIds.includes(item.id)}
                  selectedCount={selectedLibraryIds.length}
                  onSelect={(e) => handleItemSelect(e, idx)}
                  onDragStart={handleItemDragStart}
                />
              ))}
            </div>
            {libraryItems.length > 1 && (
              <p className="text-[9px] text-gray-600 mt-3 text-center">
                Ctrl/Cmd+클릭: 다중선택 | Shift+클릭: 범위선택
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
