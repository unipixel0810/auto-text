'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { VideoClip } from '@/types/video';
import ContextMenu from '@/components/ui/ContextMenu';
import Tooltip from '@/components/ui/Tooltip';

interface TimelineProps {
  clips: VideoClip[];
  playheadPosition: number;
  selectedClipId?: string | null;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  snapEnabled?: boolean;
  onSnapToggle?: () => void;
  onPlayheadChange?: (position: number) => void;
  onHoverTimeChange?: (time: number | null) => void;
  onClipAdd?: (file: File, trackIndex: number, startTime: number) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  onClipSelect?: (clipId: string | null) => void;
  onClipDelete?: (clipId: string) => void;
  onSplit?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSpeedChange?: (clipId: string, speed: number) => void;
  onFitToScreen?: () => void;
  onTrimLeft?: () => void;
  onTrimRight?: () => void;
  isTimelineHovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
}

const TRACK_CONTROLS_WIDTH = 96;
const MIN_CLIP_DURATION = 0.3;
const DELETE_THRESHOLD = 0.2;
const SNAP_THRESHOLD_PX = 8;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

// Timeline layer order (top to bottom): Overlays(10-14) > Main Video(1) > Audio(20-24)
const TRACKS = [
  { trackIndex: 14, label: 'Overlay 5', icon: 'layers', color: 'cyan', height: 'h-9' },
  { trackIndex: 13, label: 'Overlay 4', icon: 'layers', color: 'cyan', height: 'h-9' },
  { trackIndex: 12, label: 'Overlay 3', icon: 'layers', color: 'cyan', height: 'h-9' },
  { trackIndex: 11, label: 'Overlay 2', icon: 'layers', color: 'cyan', height: 'h-9' },
  { trackIndex: 10, label: 'Overlay 1', icon: 'layers', color: 'cyan', height: 'h-9' },
  { trackIndex: 0, label: 'Subtitles', icon: 'subtitles', color: 'purple', height: 'h-8' },
  { trackIndex: 1, label: 'Main Video', icon: 'movie', color: 'blue', height: 'h-12' },
  { trackIndex: 20, label: 'Audio 1', icon: 'audiotrack', color: 'green', height: 'h-9' },
  { trackIndex: 21, label: 'Audio 2', icon: 'audiotrack', color: 'green', height: 'h-9' },
  { trackIndex: 22, label: 'Audio 3', icon: 'audiotrack', color: 'green', height: 'h-9' },
];

const TRACK_COLORS: Record<number, { bg: string; bgSel: string; border: string; text: string }> = {
  0: { bg: 'bg-purple-900/50', bgSel: 'bg-purple-700/60', border: 'border-purple-500/50', text: 'text-purple-100' },
  1: { bg: 'bg-blue-900/50', bgSel: 'bg-blue-700/60', border: 'border-blue-500/50', text: 'text-white' },
  // Overlays (10-14)
  10: { bg: 'bg-cyan-900/40', bgSel: 'bg-cyan-700/60', border: 'border-cyan-500/40', text: 'text-cyan-100' },
  11: { bg: 'bg-cyan-900/40', bgSel: 'bg-cyan-700/60', border: 'border-cyan-500/40', text: 'text-cyan-100' },
  12: { bg: 'bg-cyan-900/40', bgSel: 'bg-cyan-700/60', border: 'border-cyan-500/40', text: 'text-cyan-100' },
  13: { bg: 'bg-cyan-900/40', bgSel: 'bg-cyan-700/60', border: 'border-cyan-500/40', text: 'text-cyan-100' },
  14: { bg: 'bg-cyan-900/40', bgSel: 'bg-cyan-700/60', border: 'border-cyan-500/40', text: 'text-cyan-100' },
  // Audio (20-24)
  20: { bg: 'bg-green-900/40', bgSel: 'bg-green-700/60', border: 'border-green-500/40', text: 'text-green-100' },
  21: { bg: 'bg-green-900/40', bgSel: 'bg-green-700/60', border: 'border-green-500/40', text: 'text-green-100' },
  22: { bg: 'bg-green-900/40', bgSel: 'bg-green-700/60', border: 'border-green-500/40', text: 'text-green-100' },
};

export default function Timeline({
  clips, playheadPosition, selectedClipId, zoom, onZoomChange, snapEnabled = true, onSnapToggle,
  onPlayheadChange, onHoverTimeChange, onClipAdd, onClipUpdate, onClipSelect, onClipDelete,
  onSplit, onUndo, onRedo, onSpeedChange, onFitToScreen, onTrimLeft, onTrimRight, isTimelineHovered, onHoverChange,
}: TimelineProps) {
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [resizingClip, setResizingClip] = useState<{
    clipId: string; edge: 'left' | 'right'; initialMouseX: number; initialStartTime: number; initialDuration: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ clipId: string; newDuration: number } | null>(null);
  const [draggingClip, setDraggingClip] = useState<{
    clipId: string; initialMouseX: number; initialStartTime: number; initialMouseY: number;
  } | null>(null);
  const [showSpeedPopup, setShowSpeedPopup] = useState(false);
  const [speedValue, setSpeedValue] = useState(1);
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [previewOverlay, setPreviewOverlay] = useState(false);
  const [trackVisibility, setTrackVisibility] = useState<Record<number, boolean>>(() => {
    const obj: Record<number, boolean> = {};
    TRACKS.forEach(t => obj[t.trackIndex] = true);
    return obj;
  });
  const [trackLocked, setTrackLocked] = useState<Record<number, boolean>>(() => {
    const obj: Record<number, boolean> = {};
    TRACKS.forEach(t => obj[t.trackIndex] = false);
    return obj;
  });

  // Scrub mode
  const [scrubMode, setScrubMode] = useState<'click' | 'hover'>('click');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const lastScrubRef = useRef(0);

  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixelsPerSecond = 50 * zoom;

  const maxTime = Math.max(clips.length > 0 ? Math.max(...clips.map(c => c.startTime + c.duration)) + 10 : 60, 60);
  const playheadX = TRACK_CONTROLS_WIDTH + (playheadPosition * pixelsPerSecond);

  // Snap helper
  const findSnapTime = useCallback((time: number, excludeClipId: string, trackIndex: number): number => {
    if (!snapEnabled) return time;
    const snapPoints: number[] = [0];
    clips.filter(c => c.trackIndex === trackIndex && c.id !== excludeClipId).forEach(c => {
      snapPoints.push(c.startTime, c.startTime + c.duration);
    });
    snapPoints.push(playheadPosition);
    let closest = time;
    let minDist = Infinity;
    for (const sp of snapPoints) {
      const dist = Math.abs((sp - time) * pixelsPerSecond);
      if (dist < SNAP_THRESHOLD_PX && dist < minDist) {
        minDist = dist;
        closest = sp;
      }
    }
    return closest;
  }, [clips, playheadPosition, pixelsPerSecond, snapEnabled]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!tracksRef.current || resizingClip || draggingClip) return;
    if ((e.target as HTMLElement).closest('[data-clip-id]')) return;
    const rect = tracksRef.current.getBoundingClientRect();
    const scrollLeft = tracksRef.current.parentElement?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft;
    onPlayheadChange?.(Math.max(0, (x - TRACK_CONTROLS_WIDTH) / pixelsPerSecond));
    onClipSelect?.(null);
  }, [pixelsPerSecond, onPlayheadChange, resizingClip, draggingClip, onClipSelect]);

  const handleClipClick = useCallback((e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();
    onClipSelect?.(clipId);
  }, [onClipSelect]);

  const handleClipContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  }, []);

  const handleDelete = useCallback(() => {
    if (contextMenu?.clipId && onClipDelete) { onClipDelete(contextMenu.clipId); setContextMenu(null); onClipSelect?.(null); }
  }, [contextMenu, onClipDelete, onClipSelect]);

  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDraggingPlayhead(true);
  }, []);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const move = (e: MouseEvent) => {
      if (!tracksRef.current) return;
      const rect = tracksRef.current.getBoundingClientRect();
      const scrollLeft = tracksRef.current.parentElement?.scrollLeft || 0;
      onPlayheadChange?.(Math.max(0, (e.clientX - rect.left + scrollLeft - TRACK_CONTROLS_WIDTH) / pixelsPerSecond));
    };
    const up = () => setIsDraggingPlayhead(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [isDraggingPlayhead, pixelsPerSecond, onPlayheadChange]);

  const handleResizeStart = useCallback((e: React.MouseEvent, clipId: string, edge: 'left' | 'right') => {
    e.preventDefault(); e.stopPropagation();
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    setResizingClip({ clipId, edge, initialMouseX: e.clientX, initialStartTime: clip.startTime, initialDuration: clip.duration });
    onClipSelect?.(clipId);
  }, [clips, onClipSelect]);

  useEffect(() => {
    if (!resizingClip) return;
    const move = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingClip.initialMouseX;
      const deltaTime = deltaX / pixelsPerSecond;
      let newStart = resizingClip.initialStartTime;
      let newDur = resizingClip.initialDuration;
      if (resizingClip.edge === 'right') {
        newDur = Math.max(0, resizingClip.initialDuration + deltaTime);
      } else {
        const maxShift = resizingClip.initialDuration - MIN_CLIP_DURATION;
        const shift = Math.min(Math.max(-resizingClip.initialStartTime, deltaTime), maxShift);
        newStart = resizingClip.initialStartTime + shift;
        newDur = resizingClip.initialDuration - shift;
      }
      setResizePreview({ clipId: resizingClip.clipId, newDuration: newDur });
      if (newDur >= MIN_CLIP_DURATION) {
        onClipUpdate?.(resizingClip.clipId, { startTime: Math.max(0, newStart), duration: newDur });
      }
    };
    const up = () => {
      const clip = clips.find(c => c.id === resizingClip.clipId);
      if (clip && clip.duration <= DELETE_THRESHOLD) onClipDelete?.(resizingClip.clipId);
      setResizingClip(null); setResizePreview(null);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [resizingClip, pixelsPerSecond, clips, onClipUpdate, onClipDelete]);

  const handleClipDragStart = useCallback((e: React.MouseEvent, clipId: string) => {
    if ((e.target as HTMLElement).dataset.handle) return;
    e.preventDefault(); e.stopPropagation();
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    setDraggingClip({ clipId, initialMouseX: e.clientX, initialStartTime: clip.startTime, initialMouseY: e.clientY });
    onClipSelect?.(clipId);
  }, [clips, onClipSelect]);

  useEffect(() => {
    if (!draggingClip) return;
    const clip = clips.find(c => c.id === draggingClip.clipId);
    if (!clip) return;
    const move = (e: MouseEvent) => {
      const deltaX = e.clientX - draggingClip.initialMouseX;
      const deltaTime = deltaX / pixelsPerSecond;
      let newStart = Math.max(0, draggingClip.initialStartTime + deltaTime);

      // Track Index Calculation (Vertical Dragging)
      const deltaY = e.clientY - (draggingClip.initialMouseY ?? e.clientY);
      const trackRows = Array.from(tracksRef.current?.children || []).filter(c => c.classList.contains('flex'));
      const currentTrackEl = trackRows.find(row => {
        const rect = row.getBoundingClientRect();
        return e.clientY >= rect.top && e.clientY <= rect.bottom;
      });

      let newTrackIndex = clip.trackIndex;
      if (currentTrackEl) {
        const trackIdxIdx = trackRows.indexOf(currentTrackEl);
        if (trackIdxIdx !== -1 && TRACKS[trackIdxIdx]) {
          const potentialTrack = TRACKS[trackIdxIdx].trackIndex;

          // Compatability check: Visual clips (1, 10-14, 0) can't move to Audio (20-24)
          const isVisual = (idx: number) => idx === 1 || (idx >= 10 && idx <= 14) || idx === 0;
          const isAudio = (idx: number) => idx >= 20 && idx <= 24;

          if ((isVisual(clip.trackIndex) && isVisual(potentialTrack)) ||
            (isAudio(clip.trackIndex) && isAudio(potentialTrack))) {
            newTrackIndex = potentialTrack;
          }
        }
      }

      newStart = findSnapTime(newStart, draggingClip.clipId, newTrackIndex);
      const endSnap = findSnapTime(newStart + clip.duration, draggingClip.clipId, newTrackIndex);
      if (endSnap !== newStart + clip.duration) newStart = endSnap - clip.duration;
      if (newStart < 0) newStart = 0;

      onClipUpdate?.(draggingClip.clipId, { startTime: newStart, trackIndex: newTrackIndex });
    };
    const up = () => setDraggingClip(null);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [draggingClip, pixelsPerSecond, clips, onClipUpdate, findSnapTime]);

  const handleTrackDrop = useCallback((e: React.DragEvent, trackIndex: number) => {
    e.preventDefault();
    const rect = tracksRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = tracksRef.current?.parentElement?.scrollLeft || 0;
    const startTime = Math.max(0, (e.clientX - rect.left + scrollLeft - TRACK_CONTROLS_WIDTH) / pixelsPerSecond);
    Array.from(e.dataTransfer.files).forEach(file => onClipAdd?.(file, trackIndex, startTime));
  }, [pixelsPerSecond, onClipAdd]);

  // ===== SCRUBBING =====
  const getTimeFromMouseX = useCallback((clientX: number): number => {
    if (!tracksRef.current) return 0;
    const rect = tracksRef.current.getBoundingClientRect();
    const scrollLeft = tracksRef.current.parentElement?.scrollLeft || 0;
    return Math.max(0, (clientX - rect.left + scrollLeft - TRACK_CONTROLS_WIDTH) / pixelsPerSecond);
  }, [pixelsPerSecond]);

  const throttledScrub = useCallback((time: number) => {
    const now = performance.now();
    if (now - lastScrubRef.current < 33) return; // 30fps throttle
    lastScrubRef.current = now;
    setScrubTime(time);
    if (isScrubbing || scrubMode === 'hover') {
      onPlayheadChange?.(time);
    }
    // Always update hoverTime for real-time previewing
    onHoverTimeChange?.(time);
  }, [onPlayheadChange, onHoverTimeChange, isScrubbing, scrubMode]);

  const handleScrubMouseDown = useCallback((e: React.MouseEvent) => {
    if (scrubMode === 'click') {
      setIsScrubbing(true);
      const time = getTimeFromMouseX(e.clientX);
      onPlayheadChange?.(time);
    }
  }, [scrubMode, getTimeFromMouseX, onPlayheadChange]);

  const handleScrubMouseMove = useCallback((e: React.MouseEvent) => {
    const time = getTimeFromMouseX(e.clientX);
    // Always update hover time for the hover scrubber line
    setHoverTime(time);
    throttledScrub(time);
  }, [getTimeFromMouseX, throttledScrub]);

  const handleScrubMouseUp = useCallback(() => {
    if (scrubMode === 'click') {
      setIsScrubbing(false);
      setScrubTime(null);
    }
  }, [scrubMode]);

  const handleScrubMouseLeave = useCallback(() => {
    setHoverTime(null);
    onHoverTimeChange?.(null);
    setScrubTime(null);
    if (scrubMode === 'click') setIsScrubbing(false);
  }, [scrubMode, onHoverTimeChange]);

  // Toggle scrub mode with S key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        setScrubMode(prev => prev === 'click' ? 'hover' : 'click');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleSpeedClick = () => {
    if (selectedClipId) {
      const clip = clips.find(c => c.id === selectedClipId);
      if (clip) setSpeedValue(clip.speed ?? 1);
    }
    setShowSpeedPopup(!showSpeedPopup);
  };

  const applySpeed = () => {
    if (selectedClipId && onSpeedChange) onSpeedChange(selectedClipId, speedValue);
    setShowSpeedPopup(false);
  };

  const renderClip = (clip: VideoClip) => {
    const colors = TRACK_COLORS[clip.trackIndex] || TRACK_COLORS[1];
    const isSel = selectedClipId === clip.id;
    const isDrag = draggingClip?.clipId === clip.id;
    const isResizing = resizingClip?.clipId === clip.id;
    const isAboutToDelete = resizePreview?.clipId === clip.id && resizePreview.newDuration <= DELETE_THRESHOLD;

    return (
      <div
        key={clip.id}
        data-clip-id={clip.id}
        onClick={(e) => handleClipClick(e, clip.id)}
        onContextMenu={(e) => handleClipContextMenu(e, clip.id)}
        onMouseDown={(e) => handleClipDragStart(e, clip.id)}
        className={`absolute top-1 bottom-1 rounded flex overflow-hidden select-none ${isAboutToDelete ? 'bg-red-900/60 border-2 border-red-500 shadow-lg shadow-red-500/50'
          : isSel ? `${colors.bgSel} border-2 border-primary shadow-lg shadow-primary/30`
            : `${colors.bg} border ${colors.border} hover:brightness-125`
          } ${isResizing || isDrag ? '' : 'transition-all duration-75'}`}
        style={{
          left: `${clip.startTime * pixelsPerSecond}px`,
          width: `${Math.max(clip.duration * pixelsPerSecond, 4)}px`,
          cursor: isDrag ? 'grabbing' : 'grab',
          opacity: isDrag ? 0.85 : 1,
          zIndex: isSel ? 5 : 1,
        }}
      >
        <div className="flex-1 flex items-center px-2 min-w-0 pointer-events-none">
          <span className={`text-[10px] font-medium truncate ${colors.text}`}>
            {isAboutToDelete ? '🗑️' : clip.name}
          </span>
          {clip.speed && clip.speed !== 1 && (
            <span className="ml-1 text-[8px] text-cyan-300 bg-cyan-900/50 px-1 rounded font-mono">{clip.speed}×</span>
          )}
        </div>
        <div data-handle="resize-left" className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 z-10"
          onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, clip.id, 'left'); }}>
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded-full" />
        </div>
        <div data-handle="resize-right" className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 z-10"
          onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, clip.id, 'right'); }}>
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded-full" />
        </div>
      </div>
    );
  };

  const cyanBtn = (active?: boolean) =>
    `p-1 rounded transition-all active:scale-90 ${active ? 'bg-[#00D4D4]/20 text-[#00D4D4]' : 'text-[#00D4D4] hover:bg-[#00D4D4]/10 hover:text-[#00D4D4]'
    }`;

  return (
    <footer
      ref={containerRef}
      className="h-64 bg-editor-bg border-t border-border-color flex flex-col shrink-0 relative"
      tabIndex={-1}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      {/* Toolbar */}
      <div className="h-9 border-b border-border-color flex items-center justify-between px-2 bg-panel-bg">
        <div className="flex items-center space-x-0.5">
          <Tooltip label="Undo" shortcut="⌘Z">
            <button onClick={onUndo} className="p-1 rounded hover:bg-white/10 text-white hover:text-primary transition-all active:scale-90">
              <span className="material-icons text-sm">undo</span>
            </button>
          </Tooltip>
          <Tooltip label="Redo" shortcut="⌘⇧Z">
            <button onClick={onRedo} className="p-1 rounded hover:bg-white/10 text-white hover:text-primary transition-all active:scale-90">
              <span className="material-icons text-sm">redo</span>
            </button>
          </Tooltip>
          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Speed — no shortcut */}
          <Tooltip label="Speed">
            <div className="relative">
              <button onClick={handleSpeedClick} className={cyanBtn(showSpeedPopup)}>
                <span className="material-symbols-outlined text-[18px]">speed</span>
              </button>
              {showSpeedPopup && (
                <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 z-50 w-48">
                  <div className="text-[10px] text-gray-400 mb-2 font-medium">클립 속도 조절</div>
                  <input type="range" min="0.1" max="10" step="0.1" value={speedValue}
                    onChange={(e) => setSpeedValue(Number(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00D4D4]" />
                  <div className="flex items-center justify-between mt-2">
                    <input type="number" min="0.1" max="10" step="0.1" value={speedValue}
                      onChange={(e) => setSpeedValue(Number(e.target.value))}
                      className="w-16 bg-black border border-gray-700 rounded text-xs text-white px-1 py-0.5 text-center focus:outline-none focus:border-[#00D4D4]" />
                    <span className="text-[10px] text-gray-500">x</span>
                    <button onClick={applySpeed} className="bg-[#00D4D4] text-black text-[10px] font-semibold px-3 py-1 rounded hover:bg-[#00D4D4]/80 active:scale-95">적용</button>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {[0.5, 1, 1.5, 2, 4].map(s => (
                      <button key={s} onClick={() => setSpeedValue(s)}
                        className={`flex-1 text-[9px] py-0.5 rounded ${speedValue === s ? 'bg-[#00D4D4]/30 text-[#00D4D4]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{s}x</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Tooltip>

          {/* Split */}
          <Tooltip label="Split" shortcut="⌘B / M">
            <button onClick={onSplit} className={cyanBtn()}>
              <span className="material-symbols-outlined text-[18px]">content_cut</span>
            </button>
          </Tooltip>

          {/* Link/Unlink — no shortcut */}
          <Tooltip label="Link/Unlink">
            <div className="relative">
              <button onClick={() => setShowLinkMenu(!showLinkMenu)} className={`${cyanBtn(showLinkMenu)} flex items-center`}>
                <span className="material-symbols-outlined text-[18px]">link</span>
                <span className="material-icons text-[10px] -ml-0.5">arrow_drop_down</span>
              </button>
              {showLinkMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 py-1 w-36">
                  <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center gap-2"
                    onClick={() => { if (selectedClipId) onClipUpdate?.(selectedClipId, { linked: true }); setShowLinkMenu(false); }}>
                    <span className="material-symbols-outlined text-sm text-[#00D4D4]">link</span> Link
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center gap-2"
                    onClick={() => { if (selectedClipId) onClipUpdate?.(selectedClipId, { linked: false }); setShowLinkMenu(false); }}>
                    <span className="material-symbols-outlined text-sm text-gray-400">link_off</span> Unlink
                  </button>
                </div>
              )}
            </div>
          </Tooltip>

          {/* Snap — no shortcut */}
          <Tooltip label={`Snap ${snapEnabled ? 'ON' : 'OFF'}`}>
            <div className="relative">
              <button onClick={() => setShowSnapMenu(!showSnapMenu)} className={`${cyanBtn(snapEnabled)} flex items-center`}>
                <span className="material-symbols-outlined text-[18px]">straighten</span>
                <span className="material-icons text-[10px] -ml-0.5">arrow_drop_down</span>
              </button>
              {showSnapMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 py-1 w-40">
                  <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center gap-2"
                    onClick={() => { onSnapToggle?.(); setShowSnapMenu(false); }}>
                    <span className={`material-symbols-outlined text-sm ${snapEnabled ? 'text-[#00D4D4]' : 'text-gray-400'}`}>
                      {snapEnabled ? 'toggle_on' : 'toggle_off'}
                    </span>
                    Snap {snapEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              )}
            </div>
          </Tooltip>

          {/* Fit to Screen */}
          <Tooltip label="Fit" shortcut="⇧Z">
            <button onClick={onFitToScreen} className={cyanBtn()}>
              <span className="material-symbols-outlined text-[18px]">fit_screen</span>
            </button>
          </Tooltip>

          {/* Preview Window — no shortcut */}
          <Tooltip label="Preview Window">
            <button onClick={() => setPreviewOverlay(!previewOverlay)} className={cyanBtn(previewOverlay)}>
              <span className="material-symbols-outlined text-[18px]">pip</span>
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Scrub Mode Toggle */}
          <Tooltip label={scrubMode === 'hover' ? '스크럽: 호버 모드 (S)' : '스크럽: 클릭 모드 (S)'}>
            <button
              onClick={() => setScrubMode(prev => prev === 'click' ? 'hover' : 'click')}
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all active:scale-90 ${scrubMode === 'hover'
                ? 'bg-[#00D4D4] text-black'
                : 'text-[#00D4D4] hover:bg-[#00D4D4]/10'
                }`}
            >
              스크럽
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Trim Left */}
          <Tooltip label="Trim Left" shortcut="Q">
            <button onClick={onTrimLeft} className={cyanBtn()} disabled={!selectedClipId}>
              <span className="material-symbols-outlined text-[18px]">first_page</span>
            </button>
          </Tooltip>

          {/* Trim Right */}
          <Tooltip label="Trim Right" shortcut="W">
            <button onClick={onTrimRight} className={cyanBtn()} disabled={!selectedClipId}>
              <span className="material-symbols-outlined text-[18px]">last_page</span>
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Delete */}
          <Tooltip label="Delete" shortcut="Del">
            <button onClick={() => { if (selectedClipId) { onClipDelete?.(selectedClipId); onClipSelect?.(null); } }}
              className={`p-1 rounded transition-all active:scale-90 ${selectedClipId ? 'text-red-400 hover:text-red-300 hover:bg-red-600/20' : 'text-gray-600'}`}>
              <span className="material-icons text-sm">delete</span>
            </button>
          </Tooltip>
        </div>

        {/* Right side: View menu + Zoom controls */}
        <div className="flex items-center space-x-1.5">
          {/* View Menu (eye icon) */}
          <div className="relative">
            <Tooltip label="View">
              <button
                onClick={() => setShowViewMenu(prev => !prev)}
                className={`p-1 rounded transition-all active:scale-90 ${showViewMenu ? 'text-[#00D4D4] bg-[#00D4D4]/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              >
                <span className="material-icons text-sm">visibility</span>
              </button>
            </Tooltip>
            {showViewMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 w-48">
                <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center justify-between"
                  onClick={() => { onZoomChange?.(Math.min(MAX_ZOOM, zoom * 1.25)); setShowViewMenu(false); }}>
                  <span>타임라인 확대</span><span className="text-gray-500 text-[10px]">⌘=</span>
                </button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center justify-between"
                  onClick={() => { onZoomChange?.(Math.max(MIN_ZOOM, zoom / 1.25)); setShowViewMenu(false); }}>
                  <span>타임라인 축소</span><span className="text-gray-500 text-[10px]">⌘-</span>
                </button>
                <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center justify-between"
                  onClick={() => { onFitToScreen?.(); setShowViewMenu(false); }}>
                  <span>화면에 맞추기</span><span className="text-gray-500 text-[10px]">⇧Z</span>
                </button>
                <div className="border-t border-gray-700 my-1" />
                <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center justify-between"
                  onClick={() => { onSnapToggle?.(); setShowViewMenu(false); }}>
                  <span>스냅 토글</span><span className="text-gray-500 text-[10px]">N</span>
                </button>
                <div className="border-t border-gray-700 my-1" />
                <button className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-[#00D4D4]/10 flex items-center justify-between"
                  onClick={() => {
                    if (document.fullscreenElement) document.exitFullscreen();
                    else document.documentElement.requestFullscreen();
                    setShowViewMenu(false);
                  }}>
                  <span>전체 화면</span><span className="text-gray-500 text-[10px]">F11</span>
                </button>
              </div>
            )}
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <Tooltip label="Zoom Out" shortcut="⌘-">
            <button onClick={() => onZoomChange?.(Math.max(MIN_ZOOM, zoom / 1.25))} className={cyanBtn()}>
              <span className="material-icons text-sm">remove</span>
            </button>
          </Tooltip>
          <input className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
            type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.05" value={zoom}
            onChange={(e) => onZoomChange?.(Number(e.target.value))} />
          <Tooltip label="Zoom In" shortcut="⌘=">
            <button onClick={() => onZoomChange?.(Math.min(MAX_ZOOM, zoom * 1.25))} className={cyanBtn()}>
              <span className="material-icons text-sm">add</span>
            </button>
          </Tooltip>
          <span className="text-[9px] text-gray-500 font-mono w-8 text-right">{(zoom * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Ruler */}
      <div className="h-6 bg-editor-bg border-b border-border-color relative overflow-hidden select-none flex">
        <div className="w-24 shrink-0 bg-panel-bg border-r border-border-color" />
        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0" style={{ width: `${maxTime * pixelsPerSecond}px`, backgroundImage: 'linear-gradient(to right, #555 1px, transparent 1px)', backgroundSize: `${50 * zoom}px 100%` }} />
          <div className="absolute inset-0 flex items-center text-[10px] text-gray-500 font-mono">
            {Array.from({ length: Math.ceil(maxTime / 5) + 1 }, (_, i) => (
              <span key={i * 5} className="absolute whitespace-nowrap" style={{ left: `${i * 5 * pixelsPerSecond}px` }}>
                {fmtTime(i * 5)}
              </span>
            ))}
          </div>
          {/* Ruler Playhead Marker (Cyan) */}
          <div className="absolute top-0 bottom-0 w-px bg-[#00D4D4] z-20" style={{ left: `${playheadPosition * pixelsPerSecond}px` }}>
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[#00D4D4] -ml-[5.5px]" />
          </div>
          {/* Ruler Hover Marker (Orange) */}
          {hoverTime !== null && (
            <div className="absolute top-0 bottom-0 w-px bg-orange-400/70 z-15" style={{ left: `${hoverTime * pixelsPerSecond}px` }}>
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-orange-400 -ml-[4.5px]" />
            </div>
          )}
        </div>
      </div>

      {/* Tracks */}
      <div
        ref={timelineRef}
        className={`flex-1 overflow-y-auto overflow-x-auto relative bg-[#151515] ${scrubMode === 'hover' ? 'cursor-crosshair' : ''}`}
        onMouseDown={handleScrubMouseDown}
        onMouseMove={handleScrubMouseMove}
        onMouseUp={handleScrubMouseUp}
        onMouseLeave={handleScrubMouseLeave}
      >
        {/* Scrub time tooltip (fixed playhead feedback) */}
        {scrubTime !== null && (
          <div
            className="absolute -top-1 z-30 bg-[#00D4D4] text-black text-[9px] font-mono px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
            style={{ left: `${TRACK_CONTROLS_WIDTH + scrubTime * pixelsPerSecond}px`, transform: 'translateX(-50%)' }}
          >
            {fmtTime(scrubTime)}
          </div>
        )}

        <div ref={tracksRef} className="flex flex-col min-h-full relative flex-1" style={{ width: `${TRACK_CONTROLS_WIDTH + maxTime * pixelsPerSecond}px`, minWidth: '100%' }} onClick={handleTimelineClick}>
          {/* Hover Scrubber Line (orange, follows mouse) */}
          {hoverTime !== null && (
            <div
              className="absolute top-0 bottom-0 z-15 pointer-events-none"
              style={{ left: `${TRACK_CONTROLS_WIDTH + hoverTime * pixelsPerSecond}px` }}
            >
              <div className="absolute top-0 bottom-0 w-px bg-orange-400/80" style={{ left: 0 }} />
              {/* Hover Scrubber Time Tooltip */}
              <div
                className="absolute -top-6 z-40 bg-orange-500 text-black text-[9px] font-mono px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap shadow-lg"
                style={{ transform: 'translateX(-50%)' }}
              >
                {fmtTime(hoverTime)}
              </div>
            </div>
          )}

          {/* Fixed Playhead Line (cyan, click to set position) */}
          <div className="absolute top-0 bottom-0 w-px bg-[#00D4D4] z-20 cursor-ew-resize" style={{ left: `${playheadX}px` }} onMouseDown={handlePlayheadMouseDown}>
            <div className="absolute top-0 bottom-0 w-px bg-[#00D4D4]" style={{ left: 0 }} />
          </div>

          {TRACKS.map((track) => {
            const isVisible = trackVisibility[track.trackIndex];
            const isLocked = trackLocked[track.trackIndex];
            return (
              <div key={track.trackIndex} className={`flex ${track.height} border-b border-gray-800 shrink-0`}>
                <div className="w-24 bg-panel-bg border-r border-border-color flex flex-col justify-center items-center shrink-0 z-10">
                  <div className="flex space-x-2 mb-1">
                    <span
                      className={`material-icons text-[14px] cursor-pointer hover:text-white transition-all active:scale-90 ${isVisible ? 'text-gray-400' : 'text-gray-600'}`}
                      title={isVisible ? 'Hide' : 'Show'}
                      onClick={() => setTrackVisibility(prev => ({ ...prev, [track.trackIndex]: !prev[track.trackIndex] }))}
                    >
                      {isVisible ? 'visibility' : 'visibility_off'}
                    </span>
                    <span
                      className={`material-icons text-[14px] cursor-pointer hover:text-white transition-all active:scale-90 ${isLocked ? 'text-[#00D4D4]' : 'text-gray-400'}`}
                      title={isLocked ? 'Unlock' : 'Lock'}
                      onClick={() => setTrackLocked(prev => ({ ...prev, [track.trackIndex]: !prev[track.trackIndex] }))}
                    >
                      {isLocked ? 'lock' : 'lock_open'}
                    </span>
                  </div>
                  <span className={`material-icons text-lg text-${track.color}-400`} title={track.label}>{track.icon}</span>
                </div>
                <div className={`flex-1 relative bg-gray-900/30 ${!isVisible ? 'opacity-30' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/10'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('bg-primary/10'); }}
                  onDrop={(e) => { e.currentTarget.classList.remove('bg-primary/10'); handleTrackDrop(e, track.trackIndex); }}>
                  {clips.filter(c => c.trackIndex === track.trackIndex).length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-xs text-gray-600">Drag {track.label.toLowerCase()} here</span>
                    </div>
                  )}
                  {clips.filter(c => c.trackIndex === track.trackIndex && isVisible).map(renderClip)}
                </div>
              </div>
            );
          })}
          {/* Filler area to make timeline look full to the bottom */}
          <div className="flex-1 flex min-h-[50px] bg-gray-900/10">
            <div className="w-24 bg-panel-bg border-r border-border-color shrink-0 h-full" />
            <div className="flex-1 h-full" />
          </div>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onDelete={handleDelete} />
      )}
    </footer>
  );
}

// Format time as HH:MM:SS (always starts from 00:00:00)
function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
