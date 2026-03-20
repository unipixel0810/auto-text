'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { VideoClip } from '@/types/video';
import ContextMenu from '@/components/ui/ContextMenu';
import Tooltip from '@/components/ui/Tooltip';

interface TimelineProps {
  clips: VideoClip[];
  playheadPosition: number;    // Blue line: edit/click position
  playbackPosition?: number;   // White line: actual playback position
  isPlaying?: boolean;
  currentTool?: 'selection' | 'blade';
  onToolChange?: (tool: 'selection' | 'blade') => void;
  selectedClipIds?: string[];
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  snapEnabled?: boolean;
  onSnapToggle?: () => void;
  onPlayheadChange?: (position: number) => void;
  onHoverTimeChange?: (time: number | null) => void;
  onClipAdd?: (file: File, trackIndex: number, startTime: number) => void;
  onFilesAdd?: (files: File[], trackIndex: number, startTime: number) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  onClipSelect?: (clipIds: string[]) => void;
  onClipDelete?: (clipId: string) => void;
  onSplit?: () => void;
  onAutoSplit?: () => void;
  onSceneSplit?: () => void;
  onAutoColorCorrection?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSpeedChange?: (clipId: string, speed: number) => void;
  onFitToScreen?: () => void;
  onTrimLeft?: () => void;
  onTrimRight?: () => void;
  rippleMode?: boolean;
  onRippleToggle?: () => void;
  onResizeEnd?: () => void;
  onInteractionStart?: () => void;  // drag/resize started — suppress history
  onInteractionEnd?: () => void;    // drag/resize ended — push history
  onSubtitleAdd?: (text: string, startTime: number) => void;
  isTimelineHovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
  onPlayheadDragChange?: (isDragging: boolean) => void;
  trackHeightScale?: number;
  onTrackHeightScaleChange?: (scale: number) => void;
}

// 반응형: CSS 변수에서 실제 값 읽기 (SSR 안전)
function getTrackControlsWidth(): number {
  if (typeof window === 'undefined') return 80;
  const val = getComputedStyle(document.documentElement).getPropertyValue('--track-label-width');
  return val ? parseInt(val, 10) : 80;
}
const TRACK_CONTROLS_WIDTH_DEFAULT = 80;
const MIN_CLIP_DURATION = 0.3;
const DELETE_THRESHOLD = 0.2;
const SNAP_THRESHOLD_PX = 8;
const MIN_ZOOM = 0.001;  // Shift+Z로 긴 영상도 한 화면에 표시 가능
const MAX_ZOOM = 5;

// ── 디자인 토큰: 장면 분할선 / 컷 편집 포인트 ──
/** 컷 편집 포인트 선 색상 (Neutral Grey) */
const CUT_POINT_COLOR = '#6B7280';
/** 컷 편집 포인트 선 두께 (px) */
const CUT_POINT_WIDTH = '1px';
/** 컷 편집 포인트 인접 판정 임계치 (초) */
const CUT_POINT_PROXIMITY = 0.15;
/** 자막↔영상 링크선 두께 */
const LINK_LINE_STROKE_WIDTH = 1;
/** 자막↔영상 링크선 불투명도 */
const LINK_LINE_OPACITY = 0.45;

// Track definitions — dynamic tracks are built from clips
type TrackDef = { trackIndex: number; label: string; icon: string; color: string; height: string };

const MAIN_TRACK: TrackDef = { trackIndex: 1, label: 'Main', icon: 'movie', color: 'blue', height: 'h-20' };

// All possible above/below tracks (used for lookups)
const ABOVE_TRACKS: TrackDef[] = [
  { trackIndex: 14, label: 'V5', icon: 'layers', color: 'cyan', height: 'h-16' },
  { trackIndex: 13, label: 'V4', icon: 'layers', color: 'cyan', height: 'h-16' },
  { trackIndex: 12, label: 'V3', icon: 'layers', color: 'cyan', height: 'h-16' },
  { trackIndex: 11, label: 'V2', icon: 'layers', color: 'cyan', height: 'h-16' },
  { trackIndex: 10, label: 'V1', icon: 'layers', color: 'cyan', height: 'h-16' },
  { trackIndex: 5, label: 'AI 자막', icon: 'auto_awesome', color: 'gray', height: 'h-8' },
  { trackIndex: 0, label: '대본', icon: 'subtitles', color: 'purple', height: 'h-8' },
];
const BELOW_TRACKS: TrackDef[] = [
  { trackIndex: 20, label: 'A1', icon: 'audiotrack', color: 'green', height: 'h-16' },
  { trackIndex: 21, label: 'A2', icon: 'audiotrack', color: 'green', height: 'h-16' },
  { trackIndex: 22, label: 'A3', icon: 'audiotrack', color: 'green', height: 'h-16' },
];

// Static fallback for init (visibility/lock state)
const ALL_TRACK_INDICES = [14, 13, 12, 11, 10, 5, 0, 1, 20, 21, 22];

function fmtTime(s: number): string {
  if (isNaN(s) || s < 0) return "00:00:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function formatTimecode(s: number, fps = 30): string {
  if (isNaN(s) || s < 0) return "00:00:00:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const fr = Math.floor((s % 1) * fps);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${fr.toString().padStart(2, '0')}`;
}

const Playhead = React.memo(({ x, onPointerDown, isDragging, time }: {
  x: number;
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging?: boolean;
  time?: number;
}) => (
  <div
    className="absolute top-0 bottom-0 w-3 -ml-1.5 z-20 cursor-ew-resize group"
    style={{ left: `${x}px` }}
    onPointerDown={onPointerDown}
  >
    <div className={`absolute top-0 bottom-0 w-px left-1/2 -ml-[0.5px] transition-all ${isDragging ? 'w-0.5 bg-orange-400' : 'bg-[#4488FF] group-hover:w-0.5 group-hover:bg-[#5599FF]'}`} />
  </div>
));


const WaveformCanvas = React.memo(({ waveform, width, height, color }: { waveform: number[]; width: number; height: number; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform.length || width <= 0 || height <= 0) return;
    // 캔버스 최대 크기 제한 (브라우저 한계 방지)
    const drawW = Math.min(width, 16000);
    const drawH = height;
    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, drawW, drawH);

    const mid = drawH / 2;
    ctx.fillStyle = color;
    const totalBars = Math.max(1, Math.floor(drawW));

    for (let px = 0; px < totalBars; px++) {
      const idxStart = (px / totalBars) * waveform.length;
      const idxEnd = ((px + 1) / totalBars) * waveform.length;
      let peak = 0;
      for (let j = Math.floor(idxStart); j < Math.min(Math.ceil(idxEnd), waveform.length); j++) {
        if (waveform[j] > peak) peak = waveform[j];
      }
      const h = Math.max(0.5, peak * drawH * 0.95);
      ctx.fillRect(px, mid - h / 2, 1, h);
    }
  }, [waveform, width, height, color]);
  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ width, height }} />;
});

const ClipItem = React.memo(({
  clip, pixelsPerSecond, selectedClipIds, draggingClipId, resizingClipId, resizePreview,
  onSelect, onContextMenu, onDragStart, onResizeStart, onVolumeChange
}: {
  clip: VideoClip,
  pixelsPerSecond: number,
  selectedClipIds: string[],
  draggingClipId?: string,
  resizingClipId?: string,
  resizePreview?: { clipId: string; newDuration: number } | null,
  onSelect: (e: React.MouseEvent, id: string) => void,
  onContextMenu: (e: React.MouseEvent, id: string) => void,
  onDragStart: (e: React.PointerEvent, id: string) => void,
  onResizeStart: (e: React.PointerEvent, id: string, edge: 'left' | 'right') => void,
  onVolumeChange?: (clipId: string, volume: number) => void,
}) => {
  const isSubtitleTrack = clip.trackIndex === 0 || (clip.trackIndex >= 5 && clip.trackIndex <= 8);
  // 자막 클립은 텍스트 color 기반으로 타임라인 색상 결정
  const colors = isSubtitleTrack
    ? SUBTITLE_COLOR_MAP[getSubtitleClipColor(clip)]
    : (TRACK_COLORS[clip.trackIndex] || TRACK_COLORS[1]);
  const isSel = selectedClipIds.includes(clip.id);
  const isDrag = draggingClipId === clip.id;
  const isResizing = resizingClipId === clip.id;
  const isAboutToDelete = resizePreview?.clipId === clip.id && resizePreview.newDuration <= DELETE_THRESHOLD;
  const clipWidth = Math.max(clip.duration * pixelsPerSecond, 4);
  const isAudioTrack = clip.trackIndex >= 20;
  const isVideoTrack = clip.trackIndex === 1 || (clip.trackIndex >= 10 && clip.trackIndex <= 14);
  const hasUrl = !!clip.url;

  // Volume drag
  const volDragRef = useRef<{ startY: number; startVol: number } | null>(null);
  useEffect(() => {
    if (!volDragRef.current) return;
    const onMove = (e: PointerEvent) => {
      const vd = volDragRef.current;
      if (!vd) return;
      const delta = -(e.clientY - vd.startY);
      const newVol = Math.max(0, Math.min(100, vd.startVol + delta));
      onVolumeChange?.(clip.id, Math.round(newVol));
    };
    const onUp = () => { volDragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  });

  return (
    <div
      data-clip-id={clip.id}
      onClick={(e) => onSelect(e, clip.id)}
      onContextMenu={(e) => onContextMenu(e, clip.id)}
      onPointerDown={(e) => onDragStart(e, clip.id)}
      className={`absolute top-1 bottom-1 rounded overflow-hidden select-none ${isAboutToDelete ? 'bg-red-900/60 border-2 border-red-500 shadow-lg shadow-red-500/50'
        : isSel ? `${colors.bgSel} border-2 border-primary shadow-lg shadow-primary/30`
          : clip.disabled ? 'bg-gray-800/80 border border-gray-700 opacity-60 grayscale-[0.5]'
            : `${colors.bg} border ${colors.border} hover:brightness-125`
        } ${isResizing || isDrag ? '' : 'transition-all duration-75'}`}
      style={{
        left: `${clip.startTime * pixelsPerSecond + (isSubtitleTrack ? 1 : 0)}px`,
        width: `${Math.max(clipWidth - (isSubtitleTrack ? 2 : 0), 2)}px`,
        cursor: isDrag ? 'grabbing' : 'grab',
        opacity: isDrag ? 0.85 : 1,
        zIndex: isSel ? 5 : 1,
        ...(clip.disabled ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)' } : {})
      }}
    >
      {/* Video/Image thumbnails filmstrip — 고정 너비 타일 반복 (축소해도 썸네일 크기 유지) */}
      {isVideoTrack && hasUrl && clip.thumbnails && clip.thumbnails.length > 0 && (() => {
        const thumbs = clip.thumbnails!;
        const TILE_W = 80; // 고정 타일 너비 (px) — 16:9 비율 기준 track height에 맞춤
        const tileCount = Math.max(1, Math.ceil(clipWidth / TILE_W));
        return (
          <div className="absolute inset-0 flex pointer-events-none overflow-hidden" style={{ background: '#1a1a2e' }}>
            {Array.from({ length: tileCount }, (_, i) => {
              // 타일 위치에 해당하는 썸네일 인덱스 선택 (클립 구간별 다른 프레임 표시)
              const thumbIdx = Math.min(Math.floor((i / tileCount) * thumbs.length), thumbs.length - 1);
              const tileWidth = i < tileCount - 1 ? TILE_W : clipWidth - TILE_W * (tileCount - 1);
              return (
                <img key={i} src={thumbs[thumbIdx]} alt="" loading="lazy" decoding="async"
                  className="h-full object-cover flex-shrink-0"
                  style={{ width: `${Math.max(tileWidth, 1)}px` }} />
              );
            })}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" />
          </div>
        );
      })()}

      {/* Audio waveform */}
      {isAudioTrack && clip.waveform && clip.waveform.length > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: '#1a2e1a' }}>
          <WaveformCanvas waveform={clip.waveform} width={clipWidth} height={36} color="rgba(74, 222, 128, 0.85)" />
        </div>
      )}
      {/* Main track audio waveform (if video has audio) — 하단 밀착 */}
      {clip.trackIndex === 1 && clip.waveform && clip.waveform.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[35%] pointer-events-none" style={{ background: 'rgba(10, 10, 35, 0.85)' }}>
          <WaveformCanvas waveform={clip.waveform} width={clipWidth} height={18} color="rgba(100, 200, 255, 0.9)" />
        </div>
      )}

      {/* Volume line for audio tracks */}
      {isAudioTrack && (
        <div
          className="absolute left-0 right-0 z-[5] cursor-ns-resize group"
          style={{ top: `${100 - (clip.volume ?? 100)}%`, height: 6, marginTop: -3 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            volDragRef.current = { startY: e.clientY, startVol: clip.volume ?? 100 };
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-yellow-400/80 group-hover:h-[3px] group-hover:bg-yellow-300 transition-all" />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[7px] text-yellow-300 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            {clip.volume ?? 100}%
          </div>
        </div>
      )}

      {/* Clip name label */}
      <div className={`absolute top-0 left-0 right-0 px-1 min-w-0 pointer-events-none z-[3] ${isSubtitleTrack ? 'bottom-0 flex items-center overflow-hidden py-0' : 'flex items-center py-0.5'}`}>
        <span className={`text-[9px] font-medium leading-tight truncate block ${isVideoTrack && clip.thumbnails?.length ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : colors.text}`}>
          {isAboutToDelete ? '🗑️' : (isSubtitleTrack ? clip.name : clip.name.replace(/\.[^.]+$/, ''))}
        </span>
        {clip.speed && clip.speed !== 1 && (
          <span className="ml-1 text-[7px] text-cyan-300 bg-cyan-900/50 px-0.5 rounded font-mono">{clip.speed}×</span>
        )}
      </div>

      {/* Timecode labels (start — duration) — 자막 트랙에서는 숨김 */}
      {!isSubtitleTrack && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1 py-px pointer-events-none z-[3]">
          <span className={`text-[7px] font-mono ${isVideoTrack && clip.thumbnails?.length ? 'text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]' : 'text-gray-400'}`}>
            {formatTimecode(clip.startTime)}
          </span>
          {clipWidth > 60 && (
            <span className={`text-[7px] font-mono ${isVideoTrack && clip.thumbnails?.length ? 'text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]' : 'text-gray-400'}`}>
              {formatTimecode(clip.duration)}
            </span>
          )}
        </div>
      )}

      {/* Resize handles — onPointerDown + e.buttons 체크로 드래그 고착 근본 해결 */}
      <div data-handle="resize-left" className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 z-10"
        onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, clip.id, 'left'); }}>
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded-full" />
      </div>
      <div data-handle="resize-right" className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 z-10"
        onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, clip.id, 'right'); }}>
        <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded-full" />
      </div>
    </div>
  );
});

const TrackRow = React.memo(({
  track,
  clips,
  pixelsPerSecond,
  selectedClipIds,
  draggingClipId,
  resizingClipId,
  resizePreview,
  isVisible,
  onSelect,
  onContextMenu,
  onDragStart,
  onResizeStart,
  onTrackDrop,
  onVolumeChange,
}: {
  track: TrackDef,
  clips: VideoClip[],
  pixelsPerSecond: number,
  selectedClipIds: string[],
  draggingClipId?: string,
  resizingClipId?: string,
  resizePreview?: { clipId: string; newDuration: number } | null,
  isVisible: boolean,
  onSelect: (e: React.MouseEvent, id: string) => void,
  onContextMenu: (e: React.MouseEvent, id: string) => void,
  onDragStart: (e: React.PointerEvent, id: string) => void,
  onResizeStart: (e: React.PointerEvent, id: string, edge: 'left' | 'right') => void,
  onTrackDrop: (e: React.DragEvent, trackIndex: number) => void,
  onVolumeChange?: (clipId: string, volume: number) => void,
}) => {
  return (
    <div className={`flex-1 relative ${track.trackIndex === 1 ? 'bg-[#0a0a0a]' : track.trackIndex >= 20 ? 'bg-green-950/30' : track.trackIndex >= 10 ? 'bg-cyan-950/20' : track.trackIndex === 5 ? 'bg-gray-900/20' : track.trackIndex === 0 ? 'bg-purple-950/20' : 'bg-gray-900/30'} ${!isVisible ? 'opacity-30' : ''}`}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/10'); }}
      onDragLeave={(e) => { e.currentTarget.classList.remove('bg-primary/10'); }}
      onDrop={(e) => { e.currentTarget.classList.remove('bg-primary/10'); onTrackDrop(e, track.trackIndex); }}>
      {clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-gray-700">Drag {track.label.toLowerCase()} here</span>
        </div>
      )}
      {isVisible && clips.map(clip => (
        <ClipItem
          key={clip.id}
          clip={clip}
          pixelsPerSecond={pixelsPerSecond}
          selectedClipIds={selectedClipIds}
          draggingClipId={draggingClipId}
          resizingClipId={resizingClipId}
          resizePreview={resizePreview}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onResizeStart={onResizeStart}
          onVolumeChange={onVolumeChange}
        />
      ))}
      {/* ★ 컷 편집 포인트 — 인접 클립 경계에 얇은 회색 실선 표시 */}
      {isVisible && (() => {
        const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
        const cutPoints: { x: number; key: string }[] = [];
        for (let i = 0; i < sorted.length - 1; i++) {
          const cur = sorted[i];
          const next = sorted[i + 1];
          const curEnd = cur.startTime + cur.duration;
          if (Math.abs(next.startTime - curEnd) < CUT_POINT_PROXIMITY) {
            cutPoints.push({ x: next.startTime * pixelsPerSecond, key: `cut_${cur.id}_${next.id}` });
          }
        }
        return cutPoints.map(pt => (
          <div
            key={pt.key}
            className="absolute top-0 bottom-0 pointer-events-none z-[2]"
            style={{
              left: `${pt.x}px`,
              width: CUT_POINT_WIDTH,
              backgroundColor: CUT_POINT_COLOR,
            }}
          />
        ));
      })()}
    </div>
  );
});

/** 자막 클립의 color 값으로 타임라인 색상 구분: 예능 / 상황 / 설명 / 기본 */
function getSubtitleClipColor(clip: VideoClip): string {
  const c = clip.color?.toLowerCase() || '#ffffff';
  // 예능: #FFE066 (노란 계열)
  if (c === '#ffe066' || c === '#ffd700' || c === '#ffd11a' || c === '#ffff00'
    || c === '#f59e0b' || c === '#facc15') return 'entertainment';
  // 상황: #A8E6CF (초록/민트 계열)
  if (c === '#a8e6cf' || c === '#00cc80' || c === '#10b981' || c === '#34d399'
    || c === '#4ade80' || c === '#50ff50') return 'situation';
  // 설명: #88D8FF (파란/하늘 계열)
  if (c === '#88d8ff' || c === '#4da6ff' || c === '#60a5fa' || c === '#3b82f6'
    || c === '#0066cc' || c === '#38bdf8') return 'explanation';
  // 기본 (대본, 흰색 등)
  return 'default';
}

const SUBTITLE_COLOR_MAP: Record<string, { bg: string; bgSel: string; border: string; text: string; lineColor: string }> = {
  entertainment: { bg: 'bg-yellow-900/50',  bgSel: 'bg-yellow-700/60',  border: 'border-yellow-500/50',  text: 'text-yellow-200',  lineColor: '#FACC15' },
  situation:     { bg: 'bg-emerald-900/50', bgSel: 'bg-emerald-700/60', border: 'border-emerald-500/50', text: 'text-emerald-200', lineColor: '#34D399' },
  explanation:   { bg: 'bg-sky-900/50',     bgSel: 'bg-sky-700/60',     border: 'border-sky-500/50',     text: 'text-sky-200',     lineColor: '#38BDF8' },
  default:       { bg: 'bg-gray-800/50',    bgSel: 'bg-gray-600/60',    border: 'border-gray-500/50',    text: 'text-gray-200',    lineColor: '#9CA3AF' },
};

const TRACK_COLORS: Record<number, { bg: string; bgSel: string; border: string; text: string }> = {
  5: { bg: 'bg-gray-800/50', bgSel: 'bg-gray-600/60', border: 'border-gray-500/50', text: 'text-gray-200' },
  6: { bg: 'bg-gray-800/50', bgSel: 'bg-gray-600/60', border: 'border-gray-500/50', text: 'text-gray-200' },
  7: { bg: 'bg-gray-800/50', bgSel: 'bg-gray-600/60', border: 'border-gray-500/50', text: 'text-gray-200' },
  8: { bg: 'bg-gray-800/50', bgSel: 'bg-gray-600/60', border: 'border-gray-500/50', text: 'text-gray-200' },
  0: { bg: 'bg-purple-900/50', bgSel: 'bg-purple-700/60', border: 'border-purple-500/50', text: 'text-purple-100' },
  1: { bg: 'bg-[#0a0a0a]', bgSel: 'bg-blue-600/40', border: 'border-primary/40', text: 'text-white' },
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

const Timeline = React.memo(({
  clips, playheadPosition, playbackPosition = 0, isPlaying = false, currentTool = 'selection', onToolChange, selectedClipIds = [], zoom, onZoomChange, snapEnabled = true, onSnapToggle,
  onPlayheadChange, onHoverTimeChange, onClipAdd, onFilesAdd, onSubtitleAdd, onClipUpdate, onClipSelect, onClipDelete,
  onSplit, onAutoSplit, onSceneSplit, onAutoColorCorrection, onUndo, onRedo, onSpeedChange, onFitToScreen, onTrimLeft, onTrimRight, rippleMode, onRippleToggle, onResizeEnd, onInteractionStart, onInteractionEnd, isTimelineHovered, onHoverChange, onPlayheadDragChange,
  trackHeightScale: trackHeightScaleProp, onTrackHeightScaleChange,
}: TimelineProps) => {
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipIds: string[] } | null>(null);

  // Lasso Selection State
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoCurrent, setLassoCurrent] = useState<{ x: number; y: number } | null>(null);
  const isLassoing = lassoStart !== null && lassoCurrent !== null;
  const [resizingClip, setResizingClip] = useState<{
    clipId: string; edge: 'left' | 'right'; initialMouseX: number; initialStartTime: number; initialDuration: number; initialTrimStart: number; initialTrimEnd: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ clipId: string; newDuration: number } | null>(null);
  const [draggingClip, setDraggingClip] = useState<{
    clipId: string; initialMouseX: number; initialStartTime: number; initialMouseY: number;
    /** 함께 이동할 다른 클립들의 초기 정보 (clipId → { initialStartTime, trackIndex }) */
    companions: { id: string; initialStartTime: number; trackIndex: number }[];
  } | null>(null);
  const pendingDragRef = useRef<{
    clipId: string; initialMouseX: number; initialStartTime: number; initialMouseY: number;
  } | null>(null);
  const draggingClipRef = useRef(draggingClip);
  draggingClipRef.current = draggingClip;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const selectedClipIdsRef = useRef(selectedClipIds);
  selectedClipIdsRef.current = selectedClipIds;
  const onClipUpdateRef = useRef(onClipUpdate);
  onClipUpdateRef.current = onClipUpdate;
  const findSnapTimeRef = useRef<((time: number, excludeClipId: string, trackIndex: number) => number) | null>(null);
  const pixelsPerSecondRef = useRef(0);
  const visibleTracksRef = useRef<TrackDef[]>([]);
  const CLIP_DRAG_THRESHOLD = 8; // 8px 이상 이동해야 드래그 시작 (단순 클릭과 확실히 분리)
  const [snapGuideLine, setSnapGuideLine] = useState<number | null>(null); // 스냅 가이드라인 시간(초)
  const [showSpeedPopup, setShowSpeedPopup] = useState(false);
  const [speedValue, setSpeedValue] = useState(1);
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [previewOverlay, setPreviewOverlay] = useState(false);
  const [trackVisibility, setTrackVisibility] = useState<Record<number, boolean>>(() => {
    const obj: Record<number, boolean> = {};
    ALL_TRACK_INDICES.forEach(t => obj[t] = true);
    return obj;
  });
  const [trackLocked, setTrackLocked] = useState<Record<number, boolean>>(() => {
    const obj: Record<number, boolean> = {};
    ALL_TRACK_INDICES.forEach(t => obj[t] = false);
    return obj;
  });

  // 반응형 트랙 컨트롤 너비 (CSS 변수에서 읽기)
  const [TRACK_CONTROLS_WIDTH, setTrackControlsWidth] = useState(TRACK_CONTROLS_WIDTH_DEFAULT);
  useEffect(() => {
    const update = () => setTrackControlsWidth(getTrackControlsWidth());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Scrub mode
  const [scrubMode, setScrubMode] = useState<'click' | 'hover'>('click');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const lastScrubRef = useRef(0);

  // Hover line uses refs + direct DOM to avoid React re-renders on every mousemove
  const hoverTimeRef = useRef<number | null>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);
  const hoverRulerRef = useRef<HTMLDivElement>(null);
  const hoverTooltip1Ref = useRef<HTMLDivElement>(null);
  const hoverTooltip2Ref = useRef<HTMLDivElement>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Optimization: Group clips by track to avoid O(N^2) filtering in render
  const groupedClips = useMemo(() => {
    const map: Record<number, VideoClip[]> = {};
    clips.forEach(clip => {
      // Merge AI subtitle tracks 6,7,8 into track 5 for single-row rendering
      const displayTrack = (clip.trackIndex >= 6 && clip.trackIndex <= 8) ? 5 : clip.trackIndex;
      if (!map[displayTrack]) map[displayTrack] = [];
      map[displayTrack].push(clip);
    });
    return map;
  }, [clips]);

  // Dynamic tracks: only show tracks that have clips, plus main track always
  const visibleTracks = useMemo((): TrackDef[] => {
    const above: TrackDef[] = [];
    // Show above tracks only if they have clips (top to bottom order)
    for (const t of ABOVE_TRACKS) {
      if (groupedClips[t.trackIndex]?.length) above.push(t);
    }
    const below: TrackDef[] = [];
    // Show below tracks only if they have clips
    for (const t of BELOW_TRACKS) {
      if (groupedClips[t.trackIndex]?.length) below.push(t);
    }
    return [...above, MAIN_TRACK, ...below];
  }, [groupedClips]);

  // Find next available overlay track (above main) for video/image drops
  const nextOverlayTrackIndex = useMemo(() => {
    // V1=10, V2=11, V3=12, V4=13, V5=14 — find first empty one
    for (const t of [10, 11, 12, 13, 14]) {
      if (!groupedClips[t]?.length) return t;
    }
    return 10; // fallback to V1
  }, [groupedClips]);

  // Find next available audio track (below main) for audio drops
  const nextAudioTrackIndex = useMemo(() => {
    for (const t of [20, 21, 22]) {
      if (!groupedClips[t]?.length) return t;
    }
    return 20; // fallback to A1
  }, [groupedClips]);

  const pixelsPerSecond = useMemo(() => 50 * zoom, [zoom]);
  const trackHeightScale = trackHeightScaleProp ?? 1;
  const setTrackHeightScale = useCallback((v: number | ((prev: number) => number)) => {
    const next = typeof v === 'function' ? v(trackHeightScale) : v;
    onTrackHeightScaleChange?.(next);
  }, [trackHeightScale, onTrackHeightScaleChange]);

  const maxTime = useMemo(() => Math.max(clips.length > 0 ? Math.max(...clips.map(c => c.startTime + c.duration)) + 10 : 60, playheadPosition + 10), [clips, playheadPosition]);
  const playheadX = useMemo(() => TRACK_CONTROLS_WIDTH + (playheadPosition * pixelsPerSecond), [playheadPosition, pixelsPerSecond]);
  const playbackX = useMemo(() => TRACK_CONTROLS_WIDTH + (playbackPosition * pixelsPerSecond), [playbackPosition, pixelsPerSecond]);

  // Snap helper — cross-track support + guide line feedback
  const findSnapTime = useCallback((time: number, excludeClipId: string, _trackIndex: number): number => {
    if (!snapEnabled) { setSnapGuideLine(null); return time; }
    const snapPoints: number[] = [0, playheadPosition];
    // 모든 트랙의 클립 경계를 스냅 대상으로 수집 (크로스 트랙 스냅)
    for (const c of clips) {
      if (c.id === excludeClipId) continue;
      snapPoints.push(c.startTime, c.startTime + c.duration);
    }
    let closest = time;
    let minDist = Infinity;
    for (const sp of snapPoints) {
      const dist = Math.abs((sp - time) * pixelsPerSecond);
      if (dist < SNAP_THRESHOLD_PX && dist < minDist) {
        minDist = dist;
        closest = sp;
      }
    }
    // 스냅 발동 시 가이드라인 표시
    if (closest !== time) {
      setSnapGuideLine(closest);
    }
    return closest;
  }, [clips, playheadPosition, pixelsPerSecond, snapEnabled]);

  // Update refs after definitions
  findSnapTimeRef.current = findSnapTime;
  pixelsPerSecondRef.current = pixelsPerSecond;
  visibleTracksRef.current = visibleTracks;

  const handleTimelineMouseDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!tracksRef.current || resizingClip || draggingClip || isDraggingPlayhead) return;
    if ((e.target as HTMLElement).closest('[data-clip-id]')) return;

    // Disable middle/right click lasso
    if (e.button !== 0) return;

    const rect = tracksRef.current.getBoundingClientRect();
    const scrollLeft = tracksRef.current.parentElement?.scrollLeft || 0;
    const scrollTop = tracksRef.current.parentElement?.scrollTop || 0;

    // Position relative to the tracks container
    const x = e.clientX - rect.left + scrollLeft;
    const y = e.clientY - rect.top + scrollTop;

    // Only start lasso if clicking in the timeline area (after controls)
    if (x > TRACK_CONTROLS_WIDTH) {
      setLassoStart({ x, y });
      setLassoCurrent({ x, y });
      // 선택 해제는 라소 드래그가 없는 단순 클릭일 때만 (pointerup에서 판단)
      // 여기서는 해제하지 않음 — handleMouseUp에서 tiny drag 감지 후 해제
    } else {
      // Just moving playhead if clicking track controls
      onPlayheadChange?.(Math.max(0, (x - TRACK_CONTROLS_WIDTH) / pixelsPerSecond));
      onClipSelect?.([]);
    }
  }, [pixelsPerSecond, onPlayheadChange, resizingClip, draggingClip, isDraggingPlayhead, onClipSelect]);

  // Handlers for ClipItem
  const handleClipClick = useCallback((e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      // Toggle selection
      const newSelection = selectedClipIds.includes(clipId)
        ? selectedClipIds.filter(id => id !== clipId)
        : [...selectedClipIds, clipId];
      onClipSelect?.(newSelection);
    } else {
      onClipSelect?.([clipId]);
    }
  }, [onClipSelect, selectedClipIds]);

  const handleClipContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault(); e.stopPropagation();
    const clipIds = selectedClipIds.includes(clipId) ? selectedClipIds : [clipId];
    if (!selectedClipIds.includes(clipId)) {
      onClipSelect?.([clipId]);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, clipIds });
  }, [selectedClipIds, onClipSelect]);

  const handleClipDragStart = useCallback((e: React.PointerEvent, clipId: string) => {
    if (e.button !== 0) return; // Left click only
    if ((e.target as HTMLElement).dataset.handle) return;
    if (currentTool !== 'selection') return; // Only drag in selection mode
    e.preventDefault(); e.stopPropagation();
    const clip = clips.find(c => c.id === clipId);
    if (!clip || trackLocked[clip.trackIndex]) return;

    // Move blue playhead to click position
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollLeft = timelineRef.current.scrollLeft;
      const time = Math.max(0, (e.clientX - rect.left + scrollLeft - TRACK_CONTROLS_WIDTH) / pixelsPerSecond);
      onPlayheadChange?.(time);
    }

    if (!selectedClipIds.includes(clipId)) {
      onClipSelect?.([clipId]);
    }

    // Use pending drag with threshold to avoid accidental moves
    pendingDragRef.current = { clipId, initialMouseX: e.clientX, initialStartTime: clip.startTime, initialMouseY: e.clientY };
    onInteractionStart?.();
  }, [clips, trackLocked, selectedClipIds, onClipSelect, onInteractionStart, currentTool, pixelsPerSecond, onPlayheadChange]);

  const handleResizeStart = useCallback((e: React.PointerEvent, clipId: string, edge: 'left' | 'right') => {
    e.preventDefault(); e.stopPropagation();
    const clip = clips.find(c => c.id === clipId);
    if (!clip || trackLocked[clip.trackIndex]) return;

    setResizingClip({ clipId, edge, initialMouseX: e.clientX, initialStartTime: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart ?? 0, initialTrimEnd: clip.trimEnd ?? clip.duration });
    setResizePreview({ clipId, newDuration: clip.duration });
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    onClipSelect?.([clipId]);
    onInteractionStart?.();
  }, [clips, trackLocked, onClipSelect, onInteractionStart]);

  const handleTrackDropWrapper = useCallback((e: React.DragEvent, trackIndex: number) => {
    e.preventDefault();
    const rect = tracksRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = tracksRef.current?.parentElement?.scrollLeft || 0;
    const startTime = Math.max(0, (e.clientX - rect.left + scrollLeft - TRACK_CONTROLS_WIDTH) / pixelsPerSecond);
    
    // Support file drop — 여러 파일은 onFilesAdd로 한 번에 전달해 겹침 방지
    if (e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 1) {
        onClipAdd?.(files[0], trackIndex, startTime);
      } else {
        onFilesAdd?.(files, trackIndex, startTime);
      }
    }
    
    // Support multiple library items drop
    const libraryItemsData = e.dataTransfer.getData('application/library-items');
    if (libraryItemsData) {
      try {
        const items: { id: string; duration: number }[] = JSON.parse(libraryItemsData);
        let offset = 0;
        for (const item of items) {
          (onClipAdd as any)?.(null, trackIndex, startTime + offset, item.id);
          offset += item.duration || 5;
        }
      } catch (err) {
        console.error('Failed to parse library items drop data', err);
      }
    }

    // Support single library item drop
    const libraryData = e.dataTransfer.getData('application/library-item');
    if (libraryData) {
      try {
        const item = JSON.parse(libraryData);
        (onClipAdd as any)?.(null, trackIndex, startTime, item.id);
      } catch (err) {
        console.error('Failed to parse library drop data', err);
      }
    }
    
    // Support subtitle drop from sidebar
    const subData = e.dataTransfer.getData('application/subtitle-item');
    if (subData) {
      try {
        const item = JSON.parse(subData);
        onSubtitleAdd?.(item.text, startTime);
      } catch (err) {
        console.error('Failed to parse subtitle drop data', err);
      }
    }
  }, [pixelsPerSecond, onClipAdd, onFilesAdd, onSubtitleAdd]);

  useEffect(() => {
    if (!lassoStart) return;

    let rafId: number;

    const handleMouseMove = (e: PointerEvent) => {
      if (!tracksRef.current) return;
      const rect = tracksRef.current.getBoundingClientRect();
      const scrollLeft = tracksRef.current.parentElement?.scrollLeft || 0;
      const scrollTop = tracksRef.current.parentElement?.scrollTop || 0;

      const x = Math.max(TRACK_CONTROLS_WIDTH, e.clientX - rect.left + scrollLeft);
      const y = Math.max(0, e.clientY - rect.top + scrollTop);

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setLassoCurrent({ x, y }));
    };

    const handleMouseUp = () => {
      if (!tracksRef.current || !lassoStart || !lassoCurrent) {
        setLassoStart(null);
        setLassoCurrent(null);
        return;
      }

      // Calculate intersection
      const xMin = Math.min(lassoStart.x, lassoCurrent.x);
      const xMax = Math.max(lassoStart.x, lassoCurrent.x);
      const yMin = Math.min(lassoStart.y, lassoCurrent.y);
      const yMax = Math.max(lassoStart.y, lassoCurrent.y);

      // If just a click (or tiny drag), move playhead + 빈 영역 클릭이므로 선택 해제
      if (Math.abs(xMax - xMin) < 5 && Math.abs(yMax - yMin) < 5) {
        // lassoStart.x는 tracksRef 기준 좌표 (scrollLeft 이중 반영)이므로 보정
        const scrollLeftNow = tracksRef.current.parentElement?.scrollLeft || 0;
        onPlayheadChange?.(Math.max(0, (lassoStart.x - scrollLeftNow - TRACK_CONTROLS_WIDTH) / pixelsPerSecond));
        onClipSelect?.([]);
      } else {
        const newlySelected: string[] = [];

        const timeMin = (xMin - TRACK_CONTROLS_WIDTH) / pixelsPerSecond;
        const timeMax = (xMax - TRACK_CONTROLS_WIDTH) / pixelsPerSecond;

        // Assuming each track is 100px tall roughly (depends on CSS, but let's calculate based on DOM elements if possible. 
        // For reliability, we can check intersection with clip elements via DOM, but math is faster:
        // y matches trackIndex roughly. 
        // Instead of DOM, we can just map track index to Y coords:
        // Text track: start at 0? No, there's a header. 
        // For a robust approach, let's query the clip DOM nodes and check overlapping bounding boxes since we have [data-clip-id]

        const clipElements = tracksRef.current.querySelectorAll('[data-clip-id]');
        const tracksRect = tracksRef.current.getBoundingClientRect();
        const scrollLeft = tracksRef.current.parentElement?.scrollLeft || 0;
        const scrollTop = tracksRef.current.parentElement?.scrollTop || 0;

        const lassoBox = {
          left: Math.min(lassoStart.x, lassoCurrent.x),
          right: Math.max(lassoStart.x, lassoCurrent.x),
          top: Math.min(lassoStart.y, lassoCurrent.y),
          bottom: Math.max(lassoStart.y, lassoCurrent.y)
        };

        clipElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const clipBox = {
            left: rect.left - tracksRect.left + scrollLeft,
            right: rect.right - tracksRect.left + scrollLeft,
            top: rect.top - tracksRect.top + scrollTop,
            bottom: rect.bottom - tracksRect.top + scrollTop
          };

          if (
            lassoBox.left < clipBox.right &&
            lassoBox.right > clipBox.left &&
            lassoBox.top < clipBox.bottom &&
            lassoBox.bottom > clipBox.top
          ) {
            const clipId = el.getAttribute('data-clip-id');
            if (clipId) newlySelected.push(clipId);
          }
        });

        if (newlySelected.length > 0) {
          onClipSelect?.(newlySelected); // Replaces or merges depending on shift/ctrl, but let's just replace for now or add
        }
      }

      setLassoStart(null);
      setLassoCurrent(null);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleMouseUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleMouseUp);
    };
  }, [lassoStart, lassoCurrent, pixelsPerSecond, onPlayheadChange, onClipSelect]);

  const handleDelete = useCallback(() => {
    if (contextMenu?.clipIds && onClipDelete) {
      contextMenu.clipIds.forEach(id => onClipDelete(id));
      setContextMenu(null);
      onClipSelect?.([]);
    }
  }, [contextMenu, onClipDelete, onClipSelect]);

  const handlePlayheadMouseDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDraggingPlayhead(true);
    onPlayheadDragChange?.(true);
  }, [onPlayheadDragChange]);

  useEffect(() => {
    if (!isDraggingPlayhead) {
      // 드래그 종료 시 툴팁 숨기기
      if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';
      if (hoverRulerRef.current) hoverRulerRef.current.style.display = 'none';
      return;
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) { setIsDraggingPlayhead(false); onPlayheadDragChange?.(false); return; }
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollLeft = timelineRef.current.scrollLeft;
      const time = Math.max(0, (e.clientX - rect.left + scrollLeft - TRACK_CONTROLS_WIDTH) / pixelsPerSecond);
      onPlayheadChange?.(time);
      // 드래그 중 주황 툴팁 업데이트
      const tracksX = TRACK_CONTROLS_WIDTH + time * pixelsPerSecond;
      if (hoverLineRef.current) { hoverLineRef.current.style.display = ''; hoverLineRef.current.style.left = `${tracksX}px`; }
      if (hoverTooltip1Ref.current) hoverTooltip1Ref.current.textContent = formatTimecode(time);
      const rulerX = time * pixelsPerSecond;
      if (hoverRulerRef.current) { hoverRulerRef.current.style.display = ''; hoverRulerRef.current.style.left = `${rulerX}px`; }
      if (hoverTooltip2Ref.current) hoverTooltip2Ref.current.textContent = formatTimecode(time);
    };
    const up = () => { setIsDraggingPlayhead(false); onPlayheadDragChange?.(false); };
    const onVisibility = () => { if (document.hidden) up(); };
    // pointermove/pointerup: 마우스를 빠르게 놓거나 포커스 이탈 시에도 확실히 종료
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isDraggingPlayhead, pixelsPerSecond, onPlayheadChange]);

  useEffect(() => {
    if (!resizingClip) return;
    const clip = clips.find(c => c.id === resizingClip.clipId);
    const speed = clip?.speed ?? 1;
    // 원본 미디어 총 길이 (미디어 좌표, speed 미적용)
    const origMediaDuration = clip?.originalDuration
      ?? ((resizingClip.initialTrimStart + resizingClip.initialDuration) * speed);

    // Main 트랙(1) 마그네틱: 왼쪽으로 늘릴 때 앞 클립 끝과 겹치지 않도록 제한
    const isMainTrack = clip?.trackIndex === 1;
    const isSubtitleTrack = clip?.trackIndex === 0 || (clip?.trackIndex !== undefined && clip.trackIndex >= 5 && clip.trackIndex <= 8);
    const prevClipEnd = isMainTrack
      ? Math.max(0, ...clips
          .filter(c => c.trackIndex === 1 && c.id !== resizingClip.clipId && c.startTime + c.duration <= resizingClip.initialStartTime + 0.01)
          .map(c => c.startTime + c.duration))
      : 0;
    // 오른쪽으로 늘릴 때 뒤 클립 시작과 겹치지 않도록 제한
    const nextClipStart = isMainTrack
      ? Math.min(Infinity, ...clips
          .filter(c => c.trackIndex === 1 && c.id !== resizingClip.clipId && c.startTime >= resizingClip.initialStartTime + resizingClip.initialDuration - 0.01)
          .map(c => c.startTime))
      : Infinity;

    const move = (e: PointerEvent) => {
      // 마우스 버튼이 이미 놓인 상태에서 move가 오면 → 강제 종료 (고착 방지)
      if (e.pointerType === 'mouse' && e.buttons === 0) { up(); return; }

      const deltaX = e.clientX - resizingClip.initialMouseX;
      const deltaTime = deltaX / pixelsPerSecond;
      let newStart = resizingClip.initialStartTime;
      let newDur = resizingClip.initialDuration;
      let newTrimStart = resizingClip.initialTrimStart;

      if (resizingClip.edge === 'right') {
        // ─── 오른쪽 끝 드래그: duration 늘리기/줄이기 ───
        // ★ startTime(왼쪽 끝)은 절대 움직이지 않음
        newDur = Math.max(MIN_CLIP_DURATION, resizingClip.initialDuration + deltaTime);
        // 자막 트랙은 미디어 길이 제한 없음 (무한 확장 가능)
        if (!isSubtitleTrack) {
          // 원본 미디어 끝 초과 불가
          const maxDurFromMedia = (origMediaDuration - resizingClip.initialTrimStart) / speed;
          if (maxDurFromMedia > 0) newDur = Math.min(newDur, maxDurFromMedia);
        }
        // Main 트랙: 뒤 클립과 겹침 방지
        if (isMainTrack && nextClipStart < Infinity) {
          const maxDurFromNext = nextClipStart - resizingClip.initialStartTime;
          newDur = Math.min(newDur, maxDurFromNext);
        }
      } else {
        // ─── 왼쪽 끝 드래그: 비파괴 복구 (Non-destructive Trimming) ───
        //
        // 핵심: shift 계산은 trimStart ≥ 0만으로 제한.
        // startTime은 별도로 clamp하여, 0이나 앞 클립 끝에서 막혀도
        // trimStart는 계속 감소 → 숨겨진 원본 프레임이 복구됨.
        // startTime이 더 못 내려가면 클립이 오른쪽으로 확장됨.
        //
        // 예: startTime=0, trimStart=5s, duration=10s, 3초 왼쪽으로 당김
        //   shift=-3 → trimStart=2s, startTime=max(0,-3)=0, duration=13s
        //   → 클립 [0,13], 원본 2초부터 재생, 숨겨진 3초 복구됨

        if (isSubtitleTrack) {
          // 자막 트랙: 한쪽 끝만 움직이고 반대쪽은 절대 불변
          // shift 범위: 왼쪽으로는 startTime이 0이 될 때까지만, 오른쪽으로는 duration이 MIN까지만
          const maxLeft = -resizingClip.initialStartTime;           // 더 이상 왼쪽 불가
          const maxRight = resizingClip.initialDuration - MIN_CLIP_DURATION; // 더 이상 오른쪽 불가
          const shift = Math.max(maxLeft, Math.min(deltaTime, maxRight));
          newStart = resizingClip.initialStartTime + shift;
          newDur = resizingClip.initialDuration - shift;  // endTime = initialStart + initialDur (불변)
          newTrimStart = 0;
        } else {
          // shift 제한: trimStart ≥ 0 + duration ≥ MIN + startTime ≥ minStart
          const maxRecovery = resizingClip.initialTrimStart / speed;
          const maxTrimMore = resizingClip.initialDuration - MIN_CLIP_DURATION;
          const minStart = isMainTrack ? prevClipEnd : 0;
          const maxLeft = -(resizingClip.initialStartTime - minStart); // startTime이 minStart까지만
          const shift = Math.max(Math.max(-maxRecovery, maxLeft), Math.min(deltaTime, maxTrimMore));

          newTrimStart = resizingClip.initialTrimStart + (shift * speed);
          newStart = resizingClip.initialStartTime + shift;
          // endTime = initialStartTime + initialDuration (불변)
          newDur = resizingClip.initialDuration - shift;
        }
      }

      // ★★★ 최종 강제 보정: 한쪽을 드래그하면 반대쪽은 절대 불변 ★★★
      if (resizingClip.edge === 'right') {
        // 오른쪽 드래그 → startTime 고정 (절대 변하면 안 됨)
        newStart = resizingClip.initialStartTime;
      } else {
        // 왼쪽 드래그 → endTime 고정 (startTime + duration = 초기값)
        const fixedEnd = resizingClip.initialStartTime + resizingClip.initialDuration;
        newDur = fixedEnd - newStart;
        if (newDur < MIN_CLIP_DURATION) {
          newDur = MIN_CLIP_DURATION;
          newStart = fixedEnd - MIN_CLIP_DURATION;
        }
      }

      setResizePreview({ clipId: resizingClip.clipId, newDuration: newDur });
      if (newDur >= MIN_CLIP_DURATION) {
        onClipUpdate?.(resizingClip.clipId, {
          startTime: Math.max(0, newStart),
          duration: newDur,
          trimStart: Math.max(0, newTrimStart),
        });
      }
    };
    const up = () => {
      // clipsRef.current 사용 — clips는 stale closure라 드래그 시작 시점 값을 가리킴
      const c = clipsRef.current.find(c => c.id === resizingClip.clipId);
      if (c && c.duration <= DELETE_THRESHOLD) {
        onClipDelete?.(resizingClip.clipId);
      } else {
        onResizeEnd?.();
      }
      setResizingClip(null); setResizePreview(null); setSnapGuideLine(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onClipSelect?.([]); // 리사이즈 종료 시 선택 해제
      onInteractionEnd?.();
    };
    // document 레벨 pointer 이벤트로 등록 — 창 밖까지 추적 가능
    // pointercancel/blur/visibilitychange는 강제 종료용 안전망
    const forceEnd = () => {
      setResizingClip(null); setResizePreview(null); setSnapGuideLine(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onInteractionEnd?.();
    };
    const onVisibility = () => { if (document.hidden) forceEnd(); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', forceEnd);
    window.addEventListener('blur', forceEnd);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', forceEnd);
      window.removeEventListener('blur', forceEnd);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resizingClip, pixelsPerSecond, clips, onClipUpdate, onClipDelete, onResizeEnd, onInteractionEnd]);

  // Pending drag → real drag with threshold
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pd = pendingDragRef.current;
      if (!pd) return;
      // 마우스 버튼이 이미 놓인 상태면 pending drag 취소 (고착 방지)
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        pendingDragRef.current = null;
        onInteractionEnd?.();
        return;
      }
      if (Math.hypot(e.clientX - pd.initialMouseX, e.clientY - pd.initialMouseY) >= CLIP_DRAG_THRESHOLD) {
        // 선택된 다른 클립들의 초기 위치 수집
        const currentClips = clipsRef.current;
        const companions = selectedClipIdsRef.current
          .filter(id => id !== pd.clipId)
          .map(id => {
            const c = currentClips.find(cl => cl.id === id);
            return c ? { id, initialStartTime: c.startTime, trackIndex: c.trackIndex } : null;
          })
          .filter(Boolean) as { id: string; initialStartTime: number; trackIndex: number }[];
        setDraggingClip({ ...pd, companions });
        pendingDragRef.current = null;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
    };
    const onUp = () => {
      if (pendingDragRef.current) {
        pendingDragRef.current = null;
        onInteractionEnd?.(); // cancelled drag — still end interaction
      }
    };
    // 포커스 이탈·탭 전환 시 pending drag 취소
    const cancel = () => {
      if (pendingDragRef.current) {
        pendingDragRef.current = null;
        onInteractionEnd?.();
      }
    };
    const onVisibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [onInteractionEnd]);

  useEffect(() => {
    if (!draggingClip) return;
    const dragInfo = draggingClip; // capture once
    let rafId: number | null = null;

    const move = (e: PointerEvent) => {
      // 마우스 버튼이 이미 놓인 상태에서 move가 오면 → 강제 종료 (고착 방지)
      if (e.pointerType === 'mouse' && e.buttons === 0) { up(); return; }

      const clientX = e.clientX;
      const clientY = e.clientY;

      // rAF으로 60fps 제한 — 중복 이벤트 건너뜀
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const currentClips = clipsRef.current;
        const pps = pixelsPerSecondRef.current;
        const clip = currentClips.find(c => c.id === dragInfo.clipId);
        if (!clip) return;

        const deltaX = clientX - dragInfo.initialMouseX;
        const deltaTime = deltaX / pps;
        let newStart = Math.max(0, dragInfo.initialStartTime + deltaTime);

        // Track Index Calculation (Vertical Dragging) — only change track if mouse moved 20px+ vertically
        let newTrackIndex = clip.trackIndex;
        const deltaY = Math.abs(clientY - dragInfo.initialMouseY);
        if (deltaY >= 20) {
          const trackRows = Array.from(tracksRef.current?.children || []).filter(c => c.classList.contains('flex'));
          const currentTrackEl = trackRows.find(row => {
            const rect = row.getBoundingClientRect();
            return clientY >= rect.top && clientY <= rect.bottom;
          });

          if (currentTrackEl) {
            const trackIdxIdx = trackRows.indexOf(currentTrackEl);
            const vt = visibleTracksRef.current;
            if (trackIdxIdx !== -1 && vt[trackIdxIdx]) {
              const potentialTrack = vt[trackIdxIdx].trackIndex;
              const isSubtitle = (idx: number) => idx === 0 || idx === 5;
              const isAudio = (idx: number) => idx >= 20;
              const isVisual = (idx: number) => idx === 1 || (idx >= 10 && idx <= 14);
              const origIsSubtitle = isSubtitle(clip.trackIndex);
              const origIsAudio = isAudio(clip.trackIndex);
              const origIsVisual = isVisual(clip.trackIndex);
              // 자막 클립: 어디든 이동 가능 (자막↔자막, 자막→비디오 등)
              // 오디오/비디오 클립: 같은 타입 트랙 내에서만 이동
              if (origIsSubtitle ||
                  (!isSubtitle(potentialTrack) &&
                   !(origIsAudio && !isAudio(potentialTrack)) &&
                   !(origIsVisual && !isVisual(potentialTrack)))) {
                newTrackIndex = potentialTrack;
              }
            }
          }
        }

        const snap = findSnapTimeRef.current;
        if (snap) {
          const startSnapped = snap(newStart, dragInfo.clipId, newTrackIndex);
          const startDidSnap = startSnapped !== newStart;
          newStart = startSnapped;
          const endSnap = snap(newStart + clip.duration, dragInfo.clipId, newTrackIndex);
          if (endSnap !== newStart + clip.duration) newStart = endSnap - clip.duration;
          // 시작점과 끝점 모두 스냅 안 됐으면 가이드라인 제거
          if (!startDidSnap && endSnap === startSnapped + clip.duration) {
            setSnapGuideLine(null);
          }
        }
        if (newStart < 0) newStart = 0;

        onClipUpdateRef.current?.(dragInfo.clipId, { startTime: newStart, trackIndex: newTrackIndex });

        // 함께 선택된 클립들도 같은 deltaTime만큼 이동
        if (dragInfo.companions.length > 0) {
          const trackDeltaY = newTrackIndex - clip.trackIndex; // 수직 이동 방향
          for (const companion of dragInfo.companions) {
            const companionClip = currentClips.find(c => c.id === companion.id);
            if (!companionClip || trackLocked[companionClip.trackIndex]) continue;
            let companionStart = Math.max(0, companion.initialStartTime + deltaTime);
            // 트랙 변경: 드래그한 클립과 같은 방향으로
            let companionTrack = companion.trackIndex;
            if (trackDeltaY !== 0) {
              const targetTrack = companion.trackIndex + trackDeltaY;
              // 같은 타입 트랙 내에서만 이동 허용
              const isSubtitle = (idx: number) => idx === 0 || idx === 5;
              const isAudio = (idx: number) => idx >= 20;
              const isVisual = (idx: number) => idx === 1 || (idx >= 10 && idx <= 14);
              const origIsSubtitle = isSubtitle(companion.trackIndex);
              const origIsAudio = isAudio(companion.trackIndex);
              const origIsVisual = isVisual(companion.trackIndex);
              if (targetTrack >= 0 &&
                  (origIsSubtitle ||
                   (!isSubtitle(targetTrack) &&
                    !(origIsAudio && !isAudio(targetTrack)) &&
                    !(origIsVisual && !isVisual(targetTrack))))) {
                companionTrack = targetTrack;
              }
            }
            onClipUpdateRef.current?.(companion.id, { startTime: companionStart, trackIndex: companionTrack });
          }
        }
      });
    };
    const up = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      setDraggingClip(null);
      setSnapGuideLine(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // 선택 유지 — 빈 영역 클릭 시에만 해제 (handleTimelineMouseDown에서 처리)
      onInteractionEnd?.();
    };
    const forceEnd = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      setDraggingClip(null);
      setSnapGuideLine(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onInteractionEnd?.();
    };
    const onVisibility = () => { if (document.hidden) forceEnd(); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', forceEnd);
    window.addEventListener('blur', forceEnd);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', forceEnd);
      window.removeEventListener('blur', forceEnd);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  // All other values accessed via refs to avoid re-registering listeners on every change
  }, [draggingClip, onInteractionEnd]);

  // ===== SCRUBBING =====
  const getTimeFromMouseX = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    return Math.max(0, (clientX - rect.left + scrollLeft - TRACK_CONTROLS_WIDTH) / pixelsPerSecond);
  }, [pixelsPerSecond]);

  const throttledScrub = useCallback((time: number) => {
    const now = performance.now();
    if (now - lastScrubRef.current < 16) return; // 60fps throttle
    lastScrubRef.current = now;
    setScrubTime(time);
    // click 모드: 클릭+드래그 중에만 playhead 이동
    // hover 모드: 마우스 올리기만 해도 playhead 이동
    if (isScrubbingRef.current || scrubMode === 'hover') {
      onPlayheadChange?.(time);
    }
  }, [onPlayheadChange, scrubMode]);

  const handleScrubMouseDown = useCallback((e: React.PointerEvent) => {
    if (scrubMode === 'click') {
      setIsScrubbing(true);
      isScrubbingRef.current = true;
      const time = getTimeFromMouseX(e.clientX);
      onPlayheadChange?.(time);
    }
  }, [scrubMode, getTimeFromMouseX, onPlayheadChange]);

  const handleScrubMouseMove = useCallback((e: React.PointerEvent) => {
    const time = getTimeFromMouseX(e.clientX);
    hoverTimeRef.current = time;

    // 재생 중에는 주황선/hover 비활성화 — 흰선(playback)만 표시
    if (isPlaying) return;

    // Always sync hover time to parent immediately (no throttle) so Q/W reads exact position
    onHoverTimeChange?.(time);

    // Direct DOM update — no React state, no re-render
    const tracksX = TRACK_CONTROLS_WIDTH + time * pixelsPerSecond;
    if (hoverLineRef.current) {
      hoverLineRef.current.style.display = '';
      hoverLineRef.current.style.left = `${tracksX}px`;
    }
    if (hoverTooltip1Ref.current) hoverTooltip1Ref.current.textContent = fmtTime(time);

    const rulerX = time * pixelsPerSecond;
    if (hoverRulerRef.current) {
      hoverRulerRef.current.style.display = '';
      hoverRulerRef.current.style.left = `${rulerX}px`;
    }
    if (hoverTooltip2Ref.current) hoverTooltip2Ref.current.textContent = fmtTime(time);

    throttledScrub(time);
  }, [getTimeFromMouseX, throttledScrub, pixelsPerSecond, onHoverTimeChange, isPlaying]);

  const handleScrubMouseUp = useCallback(() => {
    if (scrubMode === 'click') {
      setIsScrubbing(false);
      isScrubbingRef.current = false;
      setScrubTime(null);
    }
  }, [scrubMode]);

  const handleScrubMouseLeave = useCallback(() => {
    hoverTimeRef.current = null;
    if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';
    if (hoverRulerRef.current) hoverRulerRef.current.style.display = 'none';
    onHoverTimeChange?.(null);
    setScrubTime(null);
    if (scrubMode === 'click') {
      setIsScrubbing(false);
      isScrubbingRef.current = false;
    }
  }, [scrubMode, onHoverTimeChange]);

  // 재생 시작 시 주황 hover 라인 즉시 숨김
  useEffect(() => {
    if (isPlaying) {
      if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';
      if (hoverRulerRef.current) hoverRulerRef.current.style.display = 'none';
      setScrubTime(null);
    }
  }, [isPlaying]);

  // Keyboard shortcuts: S=scrub toggle, Ctrl+/- =zoom, Shift+Z=fit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Cmd+/- 줌 및 Shift+Z는 page.tsx에서 activeSection 기반으로 통합 관리
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-')) return;
      if (e.code === 'KeyZ' && e.shiftKey && !e.ctrlKey && !e.metaKey) return;

      if (isInput) return;

      // S : scrub mode toggle
      if (e.code === 'KeyS' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setScrubMode(prev => prev === 'click' ? 'hover' : 'click');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom, onZoomChange, onFitToScreen]);

  // Apply speed change to all selected clips
  const applySpeedChange = useCallback(() => {
    if (selectedClipIds.length > 0) {
      let isChanged = false;
      const speedUpdates = [...selectedClipIds];

      const newClips = clips.map(c => {
        if (speedUpdates.includes(c.id)) {
          const originalDuration = c.originalDuration ?? c.duration;
          const newDuration = originalDuration / speedValue;
          if (c.duration !== newDuration) {
            isChanged = true;
            onClipUpdate?.(c.id, {
              speed: speedValue,
              duration: newDuration,
              originalDuration
            });
          }
        }
        return c;
      });

      if (isChanged && onSpeedChange) {
        // Notify parent if needed, though onClipUpdate handles the state
        // Assuming onSpeedChange is for a single clip in parent, we might need to update the parent logic or just use onClipUpdate
        // For now, trigger it if there's exactly one, or update the parent to handle multiple
        if (selectedClipIds.length === 1) {
          onSpeedChange(selectedClipIds[0], speedValue);
        }
      }
    }
    setShowSpeedPopup(false);
  }, [selectedClipIds, clips, speedValue, onClipUpdate, onSpeedChange]);

  const handleSpeedClick = () => {
    if (selectedClipIds.length > 0) {
      const clip = clips.find(c => c.id === selectedClipIds[0]); // Use first selected clip for initial speed value
      if (clip) setSpeedValue(clip.speed ?? 1);
    }
    setShowSpeedPopup(!showSpeedPopup);
  };


  const cyanBtn = (active?: boolean) =>
    `p-1 rounded transition-all active:scale-90 ${active ? 'bg-[#00D4D4]/20 text-[#00D4D4]' : 'text-[#00D4D4] hover:bg-[#00D4D4]/10 hover:text-[#00D4D4]'
    }`;

  return (
    <footer
      ref={containerRef}
      className="flex-1 bg-editor-bg border-t border-border-color flex flex-col relative overflow-hidden"
      tabIndex={-1}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      {/* Toolbar */}
      <div className="editor-toolbar border-b border-border-color flex items-center justify-between px-2 bg-panel-bg" style={{ height: 'var(--toolbar-height, 36px)' }}>
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

          {/* Tool Mode: Selection (A) / Blade (B) */}
          <Tooltip label="선택 툴" shortcut="A">
            <button
              onClick={() => onToolChange?.('selection')}
              className={`p-1 rounded transition-all active:scale-90 ${currentTool === 'selection' ? 'bg-[#00D4D4]/20 text-[#00D4D4]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            >
              <span className="material-icons text-sm">near_me</span>
            </button>
          </Tooltip>
          <Tooltip label="자르기 툴" shortcut="B">
            <button
              onClick={() => onToolChange?.('blade')}
              className={`p-1 rounded transition-all active:scale-90 ${currentTool === 'blade' ? 'bg-[#00D4D4]/20 text-[#00D4D4]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            >
              <span className="material-symbols-outlined text-sm">carpenter</span>
            </button>
          </Tooltip>
          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Speed — no shortcut */}
          <Tooltip label="속도 조절">
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
                    <button onClick={applySpeedChange} className="bg-[#00D4D4] text-black text-[10px] font-semibold px-3 py-1 rounded hover:bg-[#00D4D4]/80 active:scale-95">적용</button>
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
          <Tooltip label="분할" shortcut="⌘B / M">
            <button onClick={onSplit} className={cyanBtn()}>
              <span className="material-symbols-outlined text-[18px]">content_cut</span>
            </button>
          </Tooltip>

          {/* Auto Split by Transcript */}
          <Tooltip label="대본 기준 분할" shortcut="⌘⇧B">
            <button onClick={onAutoSplit} className={cyanBtn()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="12" y1="5" x2="12" y2="19" strokeDasharray="2 2" />
                <path d="M17.5 9l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </Tooltip>

          {/* Scene Detection Split */}
          <Tooltip label="장면 전환 감지 분할">
            <button onClick={onSceneSplit} className={cyanBtn()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="8" height="14" rx="1" />
                <rect x="14" y="5" width="8" height="14" rx="1" />
                <path d="M10 9l4 3-4 3z" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </Tooltip>

          {/* Auto Color Correction */}
          {(() => {
            const selClip = selectedClipIds.length > 0
              ? clips.find(c => c.id === selectedClipIds[0])
              : clips.find(c => c.trackIndex === 1);
            const isColorActive = !!selClip?.autoColorCorrection;
            return (
              <Tooltip label={isColorActive ? '색보정 ON (클릭하여 해제)' : '자동 색보정'} shortcut="C">
                <button onClick={onAutoColorCorrection} className={cyanBtn(isColorActive)}>
                  <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                </button>
              </Tooltip>
            );
          })()}

          {/* Link/Unlink — 선택된 클립이 모두 linked면 활성화, 클릭으로 토글 */}
          {(() => {
            const isLinked = selectedClipIds.length > 0 &&
              selectedClipIds.every(id => clips.find(c => c.id === id)?.linked === true);
            return (
              <Tooltip label={isLinked ? '연결 해제 (Unlink)' : '연결 (Link Audio+Video)'}>
                <button
                  onClick={() => {
                    const nextLinked = !isLinked;
                    if (nextLinked) {
                      // Link: 선택된 클립들을 같은 그룹으로 묶음
                      const groupId = selectedClipIds[0];
                      selectedClipIds.forEach(id => onClipUpdate?.(id, { linked: true, linkGroupId: groupId }));
                    } else {
                      // Unlink: 그룹 해제
                      selectedClipIds.forEach(id => onClipUpdate?.(id, { linked: false, linkGroupId: undefined }));
                    }
                  }}
                  disabled={selectedClipIds.length === 0}
                  className={`${cyanBtn(isLinked)} flex items-center disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isLinked ? 'link' : 'link_off'}
                  </span>
                </button>
              </Tooltip>
            );
          })()}

          {/* Snap (자석) — 클릭 토글 */}
          <Tooltip label={snapEnabled ? '자석 ON (클립 자동 흡착)' : '자석 OFF (미세 조정)'} shortcut="N">
            <button onClick={() => onSnapToggle?.()} className={`${cyanBtn(snapEnabled)} relative`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                {/* U자형 자석 아이콘 — 빨강/파랑 극 표시 */}
                <path d="M4 18V10a8 8 0 0 1 16 0v8h-5v-8a3 3 0 0 0-6 0v8H4z" fill="none" stroke="currentColor" strokeWidth="2" />
                {/* 왼쪽 극 (빨강) */}
                <rect x="4" y="15" width="5" height="4" rx="0.5" fill={snapEnabled ? '#EF4444' : 'currentColor'} opacity={snapEnabled ? 1 : 0.4} />
                {/* 오른쪽 극 (파랑) */}
                <rect x="15" y="15" width="5" height="4" rx="0.5" fill={snapEnabled ? '#3B82F6' : 'currentColor'} opacity={snapEnabled ? 1 : 0.4} />
                {/* 자력선 (ON일 때만) */}
                {snapEnabled && (
                  <>
                    <path d="M8 5c0-1.5 2-3 4-3s4 1.5 4 3" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" opacity="0.5" />
                  </>
                )}
              </svg>
              {!snapEnabled && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[20px] h-0.5 bg-red-400 rotate-45 opacity-70" />
                </div>
              )}
            </button>
          </Tooltip>

          {/* Fit to Screen */}
          <Tooltip label="화면에 맞추기" shortcut="⇧Z">
            <button onClick={onFitToScreen} className={cyanBtn()}>
              <span className="material-symbols-outlined text-[18px]">fit_screen</span>
            </button>
          </Tooltip>

          {/* Preview Window — no shortcut */}
          <Tooltip label="미리보기 창">
            <button onClick={() => setPreviewOverlay(!previewOverlay)} className={cyanBtn(previewOverlay)}>
              <span className="material-symbols-outlined text-[18px]">pip</span>
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Scrub Mode Toggle */}
          <Tooltip label={scrubMode === 'hover' ? '스크럽: 호버 모드 (S)' : '스크럽: 클릭 모드 (S)'}>
            <button
              onClick={() => setScrubMode(prev => prev === 'click' ? 'hover' : 'click')}
              className={`p-1 rounded transition-all active:scale-90 ${scrubMode === 'hover'
                ? 'bg-[#00D4D4] text-black'
                : 'text-[#00D4D4] hover:bg-[#00D4D4]/10'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {/* 세로선 */}
                <line x1="6" y1="2" x2="6" y2="22" />
                {/* 마우스 화살표 커서 */}
                <path d="M12 6l7 9h-4l2 5h-3l-2-5-3 2.5z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
              </svg>
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Trim Left / Right */}
          <Tooltip label="왼쪽 트림" shortcut="Q">
            <button onClick={onTrimLeft} className={cyanBtn()} disabled={selectedClipIds.length !== 1}>
              <span className="text-[18px] font-bold leading-none">[</span>
            </button>
          </Tooltip>
          <Tooltip label="오른쪽 트림" shortcut="W">
            <button onClick={onTrimRight} className={cyanBtn()} disabled={selectedClipIds.length !== 1}>
              <span className="text-[18px] font-bold leading-none">]</span>
            </button>
          </Tooltip>

          <div className="w-px h-3 bg-gray-600 mx-1" />

          {/* Ripple / Gap mode toggle — left arrow = push clips toward 00:00:00 */}
          <Tooltip label={rippleMode ? '리플 편집: 클립을 왼쪽(00:00:00)으로 갭 없이 당김' : '일반 편집: 갭 허용'}>
            <button
              onClick={onRippleToggle}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all active:scale-90 ${
                rippleMode
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/10 border border-transparent'
              }`}
            >
              <span className="material-icons text-[18px]">{rippleMode ? 'keyboard_double_arrow_left' : 'space_bar'}</span>
              {rippleMode ? 'Ripple' : 'Gap'}
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Delete */}
          <Tooltip label="삭제" shortcut="Del">
            <button onClick={() => { if (selectedClipIds.length > 0) { selectedClipIds.forEach(id => onClipDelete?.(id)); onClipSelect?.([]); } }}
              className={`p-1 rounded transition-all active:scale-90 ${selectedClipIds.length > 0 ? 'text-red-400 hover:text-red-300 hover:bg-red-600/20' : 'text-gray-600'}`}>
              <span className="material-icons text-[18px]">delete</span>
            </button>
          </Tooltip>
        </div>

        {/* Right side: View menu + Zoom controls */}
        <div className="flex items-center space-x-1.5">
          {/* View Menu (eye icon) */}
          <div className="relative">
            <Tooltip label="보기">
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
          <Tooltip label="축소" shortcut="⌘-">
            <button onClick={() => onZoomChange?.(Math.max(MIN_ZOOM, zoom / 1.25))} className={cyanBtn()}>
              <span className="material-icons text-sm">remove</span>
            </button>
          </Tooltip>
          <input className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
            type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.001" value={zoom}
            onChange={(e) => onZoomChange?.(Number(e.target.value))} />
          <Tooltip label="확대" shortcut="⌘=">
            <button onClick={() => onZoomChange?.(Math.min(MAX_ZOOM, zoom * 1.25))} className={cyanBtn()}>
              <span className="material-icons text-sm">add</span>
            </button>
          </Tooltip>
          <span className="text-[9px] text-gray-500 font-mono w-8 text-right">{(zoom * 100).toFixed(0)}%</span>
          <div className="w-px h-4 bg-gray-700" />
          <Tooltip label="트랙 높이">
            <button
              onClick={() => setTrackHeightScale(1)}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
            >
              <span className="material-icons text-sm">unfold_more</span>
            </button>
          </Tooltip>
          <input className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
            type="range" min={0.5} max={2.5} step={0.1} value={trackHeightScale}
            onChange={(e) => setTrackHeightScale(Number(e.target.value))} />
          <span className="text-[9px] text-gray-500 font-mono w-6 text-right">{(trackHeightScale * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Ruler */}
      <div className="h-6 bg-editor-bg border-b border-border-color relative select-none flex" style={{ overflow: 'visible' }}>
        <div className="shrink-0 bg-panel-bg border-r border-border-color" style={{ width: `${TRACK_CONTROLS_WIDTH}px` }} />
        <div className="flex-1 relative" style={{ overflow: 'visible' }}>
          {/* 반응형 눈금: zoom에 따라 레이블 간격을 자동 선택 */}
          {(() => {
            // 레이블 최소 간격(px) — 겹치지 않으려면 최소 60px 필요
            const MIN_LABEL_PX = 60;
            // 후보 간격(초) — 사람이 읽기 좋은 단위
            const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
            const labelStep = STEPS.find(s => s * pixelsPerSecond >= MIN_LABEL_PX) ?? 3600;
            // 소눈금: 레이블 간격의 1/5 (단, 최소 4px 이상일 때만)
            const subStep = labelStep / 5;
            const showSubTicks = subStep * pixelsPerSecond >= 4;
            const totalTicks = Math.ceil(maxTime / subStep) + 1;

            // 프레임 단위 레이블 표시: 레이블 간격 1초 미만 or zoom이 충분히 클 때
            const showFrames = labelStep < 1 || pixelsPerSecond >= 150;
            const FPS = 30;

            // 시간 포맷: zoom에 따라 프레임 포함 여부 결정
            const fmtLabel = (s: number) => {
              if (showFrames) {
                // HH:MM:SS:FF
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                const sec = Math.floor(s % 60);
                const f = Math.round((s % 1) * FPS);
                if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
                if (m > 0) return `${m}:${String(sec).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
                return `${String(sec).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
              }
              if (s < 60) return `${s}s`;
              if (s < 3600) {
                const m = Math.floor(s / 60), sec = s % 60;
                return sec === 0 ? `${m}m` : `${m}:${String(sec).padStart(2,'0')}`;
              }
              const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
              return m === 0 ? `${h}h` : `${h}:${String(m).padStart(2,'0')}`;
            };

            return (
              <>
                {/* 소눈금 */}
                {showSubTicks && Array.from({ length: totalTicks }, (_, i) => {
                  const t = i * subStep;
                  const isLabel = Math.round(t % labelStep) === 0;
                  if (isLabel) return null; // 레이블 위치는 아래서 처리
                  return (
                    <div key={`sub-${i}`} className="absolute bottom-0 bg-gray-600"
                      style={{ left: `${t * pixelsPerSecond}px`, width: '1px', height: '4px' }} />
                  );
                })}
                {/* 레이블 + 대눈금 */}
                {Array.from({ length: Math.ceil(maxTime / labelStep) + 1 }, (_, i) => {
                  const t = i * labelStep;
                  return (
                    <div key={`lbl-${i}`} className="absolute bottom-0 flex flex-col items-start" style={{ left: `${t * pixelsPerSecond}px` }}>
                      <div className="bg-gray-400" style={{ width: '1px', height: '8px' }} />
                      <span className="text-[9px] text-gray-400 font-mono whitespace-nowrap" style={{ marginTop: '-20px', paddingLeft: '2px' }}>
                        {fmtLabel(t)}
                      </span>
                    </div>
                  );
                })}
              </>
            );
          })()}
          <div className="absolute inset-0" style={{ width: `${maxTime * pixelsPerSecond}px` }} />
          
          {/* Blue playhead in ruler — 항상 표시 */}
          <Playhead x={(isPlaying ? playbackPosition : playheadPosition) * pixelsPerSecond} onPointerDown={handlePlayheadMouseDown} isDragging={isDraggingPlayhead} time={isPlaying ? playbackPosition : playheadPosition} />

          {/* White playback marker in ruler — 재생 중일 때만 표시 */}
          {isPlaying && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: `${playbackPosition * pixelsPerSecond}px`, zIndex: 9999 }}
            >
              <div className="absolute top-0 bottom-0 left-0" style={{ width: '2px', backgroundColor: '#FFFFFF' }} />
            </div>
          )}

          {/* Hover ruler marker — DOM-direct, no React state */}
          <div
            ref={hoverRulerRef}
            className="absolute top-0 bottom-0 w-3 -ml-1.5 pointer-events-none"
            style={{ display: 'none', zIndex: 15 }}
          >
            <div className="absolute top-0 bottom-0 w-px bg-orange-400/80 left-1/2 -ml-[0.5px]" />
            <div ref={hoverTooltip2Ref} className="hidden" />
          </div>

          {/* Lasso Box — fixed position으로 뷰포트 기준 렌더링 (스크롤 무관하게 마우스와 정확히 일치) */}
          {isLassoing && lassoStart && lassoCurrent && (() => {
            const tracksRect = tracksRef.current?.getBoundingClientRect();
            const scrollLeft = tracksRef.current?.parentElement?.scrollLeft || 0;
            const scrollTop = tracksRef.current?.parentElement?.scrollTop || 0;
            if (!tracksRect) return null;
            // 콘텐츠 절대좌표 → 뷰포트 픽셀 좌표로 역변환
            const toVpX = (cx: number) => cx - scrollLeft + tracksRect.left;
            const toVpY = (cy: number) => cy - scrollTop + tracksRect.top;
            const x1 = toVpX(Math.min(lassoStart.x, lassoCurrent.x));
            const y1 = toVpY(Math.min(lassoStart.y, lassoCurrent.y));
            const x2 = toVpX(Math.max(lassoStart.x, lassoCurrent.x));
            const y2 = toVpY(Math.max(lassoStart.y, lassoCurrent.y));
            return (
              <div
                className="pointer-events-none rounded-sm"
                style={{
                  position: 'fixed',
                  left: x1,
                  top: y1,
                  width: x2 - x1,
                  height: y2 - y1,
                  zIndex: 9999,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.75)',
                  boxShadow: '0 0 8px rgba(255, 255, 255, 0.15), inset 0 0 12px rgba(255, 255, 255, 0.04)',
                }}
              />
            );
          })()}
        </div>
      </div>
      {/* ... speed popup and tooltips etc remain below */}

      {/* Tracks */}
      <div
        ref={timelineRef}
        data-timeline-scroll="true"
        className={`flex-1 overflow-y-auto overflow-x-auto relative bg-[#151515] ${scrubMode === 'hover' ? 'cursor-crosshair' : currentTool === 'blade' ? 'cursor-crosshair' : ''}`}
        style={{ display: 'flex', flexDirection: 'column' }}
        onPointerDown={handleScrubMouseDown}
        onPointerMove={handleScrubMouseMove}
        onPointerUp={handleScrubMouseUp}
        onPointerLeave={handleScrubMouseLeave}
      >
        {/* Scrub time tooltip (fixed playhead feedback) */}
        {scrubTime !== null && (
          <div
            className="absolute -top-1 z-30 bg-orange-500 text-black text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap shadow-lg"
            style={{ left: `${TRACK_CONTROLS_WIDTH + scrubTime * pixelsPerSecond}px`, transform: 'translateX(-50%)' }}
          >
            {formatTimecode(scrubTime)}
          </div>
        )}

        <div
          ref={tracksRef}
          className="flex flex-col relative min-w-full"
          style={{ width: `calc(${TRACK_CONTROLS_WIDTH + maxTime * pixelsPerSecond}px + 20% )`, minHeight: '100%' }}
          onPointerDown={handleTimelineMouseDown}
        >
          {/* Hover Scrubber Line (orange) — DOM-direct, no React state */}
          <div
            ref={hoverLineRef}
            className="absolute top-0 bottom-0 w-3 -ml-1.5 pointer-events-none"
            style={{ display: 'none', zIndex: 15 }}
          >
            <div className="absolute top-0 bottom-0 w-px bg-orange-400/80 left-1/2 -ml-[0.5px]" />
            <div
              ref={hoverTooltip1Ref}
              className="absolute -top-6 left-1/2 bg-orange-500 text-black text-[9px] font-mono px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap shadow-lg -translate-x-1/2"
            />
          </div>

          {/* White Playback Line — 재생 중일 때만 표시 (정지 시 파란 선이 그 위치로 이동) */}
          {isPlaying && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: `${playbackX}px`, zIndex: 9999 }}
            >
              <div className="absolute top-0 bottom-0 left-0" style={{ width: '2px', backgroundColor: '#FFFFFF', boxShadow: '0 0 6px rgba(255,255,255,0.8)' }} />
            </div>
          )}

          {/* Snap Guide Line — 스냅 발동 시 노란 점선 표시 */}
          {snapGuideLine !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: `${TRACK_CONTROLS_WIDTH + snapGuideLine * pixelsPerSecond}px`,
                zIndex: 45,
              }}
            >
              <div
                className="absolute top-0 bottom-0"
                style={{
                  width: '1px',
                  borderLeft: '1px dashed #FACC15',
                  opacity: 0.9,
                }}
              />
            </div>
          )}

          {/* Blue Edit Line — 항상 표시 (재생 중에는 playback 위치 추적) */}
          <Playhead x={TRACK_CONTROLS_WIDTH + (isPlaying ? playbackPosition : playheadPosition) * pixelsPerSecond} onPointerDown={handlePlayheadMouseDown} isDragging={isDraggingPlayhead} time={isPlaying ? playbackPosition : playheadPosition} />

          {/* Top spacer — drop zone for video/image → overlay tracks */}
          <div className="flex" style={{ flex: '1 0 0', minHeight: '8px' }}>
            <div className="bg-panel-bg border-r border-border-color shrink-0 h-full" style={{ width: `${TRACK_CONTROLS_WIDTH}px` }} />
            <div
              className="flex-1 h-full relative transition-colors"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-cyan-500/10'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('bg-cyan-500/10'); }}
              onDrop={(e) => { e.currentTarget.classList.remove('bg-cyan-500/10'); handleTrackDropWrapper(e, nextOverlayTrackIndex); }}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 peer-drag:opacity-100">
                <span className="text-[10px] text-gray-600">Drop video/image here</span>
              </div>
            </div>
          </div>

          {visibleTracks.map((track, idx) => {
            const trackClips = groupedClips[track.trackIndex] || [];
            const isVisible = trackVisibility[track.trackIndex] ?? true;
            const isLocked = trackLocked[track.trackIndex] ?? false;

            // Separator: show before first audio track (below main)
            const prevTrack = visibleTracks[idx - 1];
            const isFirstAudio = track.trackIndex >= 20 && (!prevTrack || prevTrack.trackIndex < 20);

            return (
              <React.Fragment key={track.trackIndex}>
                {isFirstAudio && (
                  <div className="h-4 bg-black/30 border-y border-white/5 shrink-0" />
                )}
                <div className="flex shrink-0" data-track-index={track.trackIndex} style={{ height: `${parseFloat(track.height.replace('h-', '')) * 4 * trackHeightScale}px` }}>
                  <div className="bg-panel-bg border-r border-border-color flex flex-col justify-center items-center shrink-0 z-10 gap-0.5" style={{ width: `${TRACK_CONTROLS_WIDTH}px` }}>
                    <span className={`material-icons text-sm text-${track.color}-400`} title={track.label}>{track.icon}</span>
                    <span className={`text-[9px] text-${track.color}-400/70`}>{track.label}</span>
                    {trackClips.length > 0 && track.trackIndex !== 1 && (
                      <div className="flex items-center gap-1">
                        <span
                          className={`material-icons cursor-pointer hover:text-white transition-all leading-none ${isVisible ? 'text-gray-500' : 'text-gray-700'}`}
                          style={{ fontSize: '10px', width: '10px', height: '10px' }}
                          onClick={() => setTrackVisibility(prev => ({ ...prev, [track.trackIndex]: !prev[track.trackIndex] }))}
                        >
                          {isVisible ? 'visibility' : 'visibility_off'}
                        </span>
                        <span
                          className={`material-icons cursor-pointer hover:text-white transition-all leading-none ${isLocked ? 'text-[#00D4D4]' : 'text-gray-500'}`}
                          style={{ fontSize: '10px', width: '10px', height: '10px' }}
                          onClick={() => setTrackLocked(prev => ({ ...prev, [track.trackIndex]: !prev[track.trackIndex] }))}
                        >
                          {isLocked ? 'lock' : 'lock_open'}
                        </span>
                      </div>
                    )}
                  </div>
                  <TrackRow
                    track={track}
                    clips={trackClips}
                    pixelsPerSecond={pixelsPerSecond}
                    selectedClipIds={selectedClipIds}
                    draggingClipId={draggingClip?.clipId}
                    resizingClipId={resizingClip?.clipId}
                    resizePreview={resizePreview}
                    isVisible={isVisible}
                    onSelect={handleClipClick}
                    onContextMenu={handleClipContextMenu}
                    onDragStart={handleClipDragStart}
                    onResizeStart={handleResizeStart}
                    onTrackDrop={handleTrackDropWrapper}
                    onVolumeChange={(clipId, volume) => onClipUpdate?.(clipId, { volume })}
                  />
                </div>
              </React.Fragment>
            );
          })}
          {/* Link Group Lines — 자막 시작점 → 영상 트랙 수직 연결선 (DOM 기반 좌표) */}
          {(() => {
            const container = tracksRef.current;
            if (!container) return null;

            // linkGroupId별로 클립 묶기
            const groups = new Map<string, typeof clips>();
            for (const c of clips) {
              if (!c.linked || !c.linkGroupId) continue;
              const list = groups.get(c.linkGroupId) || [];
              list.push(c);
              groups.set(c.linkGroupId, list);
            }
            if (groups.size === 0) return null;

            // DOM에서 실제 트랙 행의 위치를 읽기
            const containerRect = container.getBoundingClientRect();
            const trackYMap = new Map<number, { top: number; bottom: number }>();
            const trackEls = container.querySelectorAll<HTMLElement>('[data-track-index]');
            for (const el of trackEls) {
              const ti = parseInt(el.getAttribute('data-track-index') || '', 10);
              if (isNaN(ti)) continue;
              const r = el.getBoundingClientRect();
              trackYMap.set(ti, {
                top: r.top - containerRect.top + container.scrollTop,
                bottom: r.bottom - containerRect.top + container.scrollTop,
              });
            }

            const lines: React.ReactNode[] = [];
            groups.forEach((groupClips, gid) => {
              if (groupClips.length < 2) return;
              const media = groupClips.find(c => c.trackIndex === 1 || (c.trackIndex >= 10 && c.trackIndex <= 14) || (c.trackIndex >= 20 && c.trackIndex <= 22));
              if (!media) return;
              const mediaPos = trackYMap.get(media.trackIndex);
              if (!mediaPos) return;

              for (const sub of groupClips) {
                if (sub.id === media.id) continue;
                const subPos = trackYMap.get(sub.trackIndex);
                if (!subPos) continue;
                // 자막의 color 속성에 맞는 링크선 색상
                const subColorKey = getSubtitleClipColor(sub);
                const lineColor = SUBTITLE_COLOR_MAP[subColorKey].lineColor;
                // 자막 시작점 X 좌표
                const x = TRACK_CONTROLS_WIDTH + sub.startTime * pixelsPerSecond;
                // 자막이 영상 위에 있으면: 자막 하단 → 영상 상단
                const isSubAbove = subPos.top < mediaPos.top;
                const y1 = isSubAbove ? subPos.bottom : subPos.top;
                const y2 = isSubAbove ? mediaPos.top : mediaPos.bottom;
                lines.push(
                  <line
                    key={`${gid}-${sub.id}`}
                    x1={x} y1={y1} x2={x} y2={y2}
                    stroke={lineColor} strokeWidth={LINK_LINE_STROKE_WIDTH} strokeOpacity={LINK_LINE_OPACITY}
                  />
                );
              }
            });

            if (lines.length === 0) return null;
            return (
              <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, overflow: 'visible' }}>
                {lines}
              </svg>
            );
          })()}

          {/* Bottom spacer — drop zone for audio → audio tracks */}
          <div className="flex" style={{ flex: '1 0 0', minHeight: '8px' }}>
            <div className="bg-panel-bg border-r border-border-color shrink-0 h-full" style={{ width: `${TRACK_CONTROLS_WIDTH}px` }} />
            <div
              className="flex-1 h-full relative transition-colors"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-green-500/10'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('bg-green-500/10'); }}
              onDrop={(e) => { e.currentTarget.classList.remove('bg-green-500/10'); handleTrackDropWrapper(e, nextAudioTrackIndex); }}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0">
                <span className="text-[10px] text-gray-600">Drop audio here</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
          { label: '잘라내기', icon: 'content_cut', shortcut: '⌘B', action: () => { onClipSelect?.(contextMenu.clipIds); onSplit?.(); } },
          { label: '복제', icon: 'content_copy', shortcut: '⌘D', action: () => {
            contextMenu.clipIds.forEach(id => {
              const clip = clips.find(c => c.id === id);
              if (clip) {
                const dup = { ...clip, id: crypto.randomUUID(), startTime: clip.startTime + (clip.duration / (clip.speed ?? 1)) };
                onClipUpdate?.(id, {}); // noop to trigger re-render
                onClipAdd?.(new File([], clip.name), clip.trackIndex, dup.startTime);
              }
            });
          }},
          { label: '삭제', icon: 'delete', shortcut: 'Del', danger: true, divider: true, action: handleDelete },
        ]} />
      )}
    </footer>
  );
});

export default Timeline;
