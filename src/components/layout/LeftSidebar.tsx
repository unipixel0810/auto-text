'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { VideoClip, LibraryItem } from '@/types/video';

interface LeftSidebarProps {
  onVideoAdd?: (file: File) => void;
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
      video.currentTime = 1; // seek to 1s for a meaningful frame
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

function ThumbnailItem({ item, isSelected, onSelect }: { item: LibraryItem; isSelected: boolean; onSelect: () => void }) {
  const thumbnail = useVideoThumbnail(item.url, item.type);
  const isVideo = item.type === 'video';
  const isAudio = item.type === 'audio';
  const isImage = item.type === 'image';

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/library-item', JSON.stringify({
      id: item.id,
      name: item.name,
      type: item.type,
      duration: item.duration,
      url: item.url
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <button
      onClick={onSelect}
      draggable
      onDragStart={handleDragStart}
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

  const routeFile = useCallback((file: File) => {
    if (isSubtitleFile(file)) {
      onSubtitleImport?.(file);
    } else {
      onVideoAdd?.(file);
    }
  }, [onVideoAdd, onSubtitleImport]);

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
    files.forEach(routeFile);
  }, [routeFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(routeFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [routeFile]);

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
          <button
            className="text-primary hover:text-white transition-all duration-200 relative group active:scale-90 hover:scale-110"
            title="Import History"
          >
            <span className="material-icons text-lg transition-transform duration-200 group-hover:rotate-180">history</span>
          </button>
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
          <div className="grid grid-cols-2 gap-2">
            {libraryItems.map((item) => (
              <ThumbnailItem
                key={item.id}
                item={item}
                isSelected={selectedLibraryIds.includes(item.id)}
                onSelect={() => onLibrarySelect?.([item.id])}
              />
            ))}
          </div>
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
