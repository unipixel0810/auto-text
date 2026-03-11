'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ContextMenu from '@/components/ui/ContextMenu';
import type { VideoClip } from '@/types/video';
import type { SubtitlePreset } from '@/lib/subtitlePresets';
import { ANIMATION_CSS_CLASS } from '@/components/editor/SubtitleAnimationPanel';

// --- Sub-components for Performance Optimization ---

const VisualLayer = React.memo(({
  activeVisualClips,
  activeVideoClipId,
  selectedClipIds,
  videoRef,
  handleVideoTimeUpdate,
  handleVideoClick,
  handleClipContextMenu,
  onPlayingChange,
  onClipSelect,
  onClipUpdate,
  canvasAspectRatio = '16:9',
  containerRef,
  onInteractionStart,
  onInteractionEnd,
}: {
  activeVisualClips: VideoClip[],
  activeVideoClipId?: string,
  selectedClipIds: string[],
  videoRef: React.RefObject<HTMLVideoElement>,
  handleVideoTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>, clipId: string) => void,
  handleVideoClick: (e: React.MouseEvent, clipId?: string) => void,
  handleClipContextMenu: (e: React.MouseEvent, clipId: string) => void,
  onPlayingChange?: (playing: boolean) => void,
  onClipSelect?: (ids: string[]) => void,
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void,
  canvasAspectRatio?: '16:9' | '9:16' | '1:1' | '3:4',
  containerRef?: React.RefObject<HTMLDivElement>,
  onInteractionStart?: () => void,
  onInteractionEnd?: () => void,
}) => {
  const DRAG_THRESHOLD = 5;
  const dragRef = useRef<{
    type: 'move' | 'resize' | 'rotate';
    clipId: string;
    startX: number; startY: number;
    origX: number; origY: number;
    origScale: number; origRotation: number;
    centerX: number; centerY: number;
    dragging: boolean;
  } | null>(null);
  const onClipUpdateRef = useRef(onClipUpdate);
  onClipUpdateRef.current = onClipUpdate;
  const onInteractionStartRef = useRef(onInteractionStart);
  onInteractionStartRef.current = onInteractionStart;
  const onInteractionEndRef = useRef(onInteractionEnd);
  onInteractionEndRef.current = onInteractionEnd;

  // Compute the fitted content area for object-contain within the container
  const getContentBounds = useCallback((clip: VideoClip) => {
    const container = containerRef?.current;
    if (!container) return null;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const mediaW = clip.mediaWidth || 1920;
    const mediaH = clip.mediaHeight || 1080;
    const mediaAR = mediaW / mediaH;
    const containerAR = containerW / containerH;
    let fitW: number, fitH: number;
    if (mediaAR > containerAR) {
      fitW = containerW;
      fitH = containerW / mediaAR;
    } else {
      fitH = containerH;
      fitW = containerH * mediaAR;
    }
    return {
      width: fitW,
      height: fitH,
      offsetX: (containerW - fitW) / 2,
      offsetY: (containerH - fitH) / 2,
    };
  }, [containerRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !onClipUpdateRef.current) return;
      if (!d.dragging) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.dragging = true;
        onInteractionStartRef.current?.(); // suppress history during drag
      }
      if (d.type === 'move') {
        onClipUpdateRef.current(d.clipId, {
          positionX: d.origX + (e.clientX - d.startX),
          positionY: d.origY + (e.clientY - d.startY),
        });
      } else if (d.type === 'resize') {
        const startDist = Math.hypot(d.startX - d.centerX, d.startY - d.centerY);
        const curDist = Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY);
        const ratio = startDist > 0 ? curDist / startDist : 1;
        onClipUpdateRef.current(d.clipId, { scale: Math.max(10, Math.round(d.origScale * ratio)) });
      } else if (d.type === 'rotate') {
        const startAngle = Math.atan2(d.startY - d.centerY, d.startX - d.centerX);
        const curAngle = Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX);
        const deg = (curAngle - startAngle) * (180 / Math.PI);
        onClipUpdateRef.current(d.clipId, { rotation: Math.round(d.origRotation + deg) });
      }
    };
    const onUp = () => {
      if (dragRef.current?.dragging) onInteractionEndRef.current?.(); // push single history entry
      dragRef.current = null;
    };
    const onCancel = () => { dragRef.current = null; };
    const onBlur = () => { if (dragRef.current?.dragging) onInteractionEndRef.current?.(); dragRef.current = null; };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const startDrag = useCallback((e: React.PointerEvent, clip: VideoClip, type: 'move' | 'resize' | 'rotate') => {
    e.stopPropagation();
    e.preventDefault();
    if (type === 'move') onClipSelect?.([clip.id]);
    const box = (e.currentTarget as HTMLElement).closest('[data-visual-box]') as HTMLElement;
    const rect = box?.getBoundingClientRect();
    dragRef.current = {
      type,
      clipId: clip.id,
      startX: e.clientX, startY: e.clientY,
      origX: clip.positionX ?? 0, origY: clip.positionY ?? 0,
      origScale: clip.scale ?? 100, origRotation: clip.rotation ?? 0,
      centerX: rect ? rect.left + rect.width / 2 : e.clientX,
      centerY: rect ? rect.top + rect.height / 2 : e.clientY,
      dragging: false,
    };
  }, [onClipSelect]);

  return (
    <>
      {activeVisualClips.map((clip) => {
        // Safety: skip audio-only clips that may have been moved to a visual track
        const isAudioFile = /\.(mp3|wav|ogg|aac|flac|m4a|wma)$/i.test(clip.url || clip.name);
        if (isAudioFile || clip.trackIndex >= 20) return null;

        const isImage = (clip.url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || clip.name.match(/\.(jpg|jpeg|png|gif|webp|svg)/i));
        const isClipSelected = selectedClipIds.includes(clip.id);
        const isMainTrack = clip.trackIndex === 1;

        if (isMainTrack) {
          // Main track: fills entire preview
          return (
            <div
              key={clip.id}
              data-visual-box
              className="absolute inset-0 pointer-events-auto"
              style={{
                transform: `translate(${clip.positionX ?? 0}px, ${clip.positionY ?? 0}px) rotate(${clip.rotation ?? 0}deg) scale(${(clip.scale ?? 100) / 100})`,
                zIndex: 1,
              }}
              onClick={(e) => { e.stopPropagation(); handleVideoClick(e, clip.id); }}
              onPointerDown={(e) => startDrag(e, clip, 'move')}
              onContextMenu={(e) => handleClipContextMenu(e, clip.id)}
            >
              {!isImage ? (
                <video
                  ref={clip.id === activeVideoClipId ? videoRef : null}
                  src={clip.url || undefined}
                  className="w-full h-full object-contain"
                  preload="auto" playsInline
                  muted={clip.id !== activeVideoClipId}
                  onTimeUpdate={(e) => handleVideoTimeUpdate(e, clip.id)}
                  onPlay={() => { if (clip.id === activeVideoClipId) onPlayingChange?.(true); }}
                  onPause={() => { if (clip.id === activeVideoClipId) onPlayingChange?.(false); }}
                  style={{ pointerEvents: 'none' }}
                />
              ) : (
                <img src={clip.url || undefined} alt={clip.name} className="w-full h-full object-contain" style={{ pointerEvents: 'none' }} />
              )}
              {isClipSelected && (() => {
                const bounds = getContentBounds(clip);
                const bStyle = bounds
                  ? { left: bounds.offsetX - 4, top: bounds.offsetY - 4, width: bounds.width + 8, height: bounds.height + 8 }
                  : { left: -4, top: -4, right: -4, bottom: -4 };
                return (
                  <>
                    <div className="absolute" style={{
                      ...bStyle,
                      border: '2px dashed #00D4D4', borderRadius: 4,
                      boxShadow: '0 0 8px rgba(0,212,212,0.3)',
                      pointerEvents: 'none',
                    }} />
                    {(['top-left','top-right','bottom-left','bottom-right'] as const).map(pos => {
                      const b = bounds || { offsetX: 0, offsetY: 0, width: containerRef?.current?.clientWidth || 0, height: containerRef?.current?.clientHeight || 0 };
                      return (
                        <div
                          key={pos}
                          className="absolute w-4 h-4 bg-primary border-2 border-white rounded-sm z-[120]"
                          style={{
                            cursor: pos.includes('left') ? (pos.includes('top') ? 'nwse-resize' : 'nesw-resize') : (pos.includes('top') ? 'nesw-resize' : 'nwse-resize'),
                            top: pos.includes('top') ? (bounds ? bounds.offsetY - 8 : -8) : undefined,
                            bottom: pos.includes('bottom') ? (bounds ? (containerRef?.current?.clientHeight || 0) - bounds.offsetY - bounds.height - 8 : -8) : undefined,
                            left: pos.includes('left') ? (bounds ? bounds.offsetX - 8 : -8) : undefined,
                            right: pos.includes('right') ? (bounds ? (containerRef?.current?.clientWidth || 0) - bounds.offsetX - bounds.width - 8 : -8) : undefined,
                          }}
                          onPointerDown={(e) => startDrag(e, clip, 'resize')}
                        />
                      );
                    })}
                    <div className="absolute left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center" style={{ top: bounds ? bounds.offsetY - 36 : -36 }}>
                      <div
                        className="w-5 h-5 rounded-full bg-green-400 border-2 border-white cursor-alias flex items-center justify-center"
                        style={{ boxShadow: '0 0 6px rgba(74,222,128,0.5)' }}
                        onPointerDown={(e) => startDrag(e, clip, 'rotate')}
                      >
                        <span className="text-[9px] text-white font-bold">↻</span>
                      </div>
                      <div className="w-px h-4 bg-green-400/60" />
                    </div>
                  </>
                );
              })()}
            </div>
          );
        }

        // Overlay clips: positioned in center, sized to media aspect ratio
        const overlayBounds = getContentBounds(clip);
        const overlayW = overlayBounds ? `${(overlayBounds.width * 0.5)}px` : '50%';
        const overlayH = overlayBounds ? `${(overlayBounds.height * 0.5)}px` : '50%';

        return (
          <div
            key={clip.id}
            data-visual-box
            className="absolute pointer-events-auto"
            style={{
              top: '50%', left: '50%',
              width: overlayW, height: overlayH,
              transform: `translate(-50%, -50%) translate(${clip.positionX ?? 0}px, ${clip.positionY ?? 0}px) rotate(${clip.rotation ?? 0}deg) scale(${(clip.scale ?? 100) / 100})`,
              zIndex: clip.trackIndex + 10,
            }}
            onClick={(e) => { e.stopPropagation(); handleVideoClick(e, clip.id); }}
            onPointerDown={(e) => startDrag(e, clip, 'move')}
            onContextMenu={(e) => handleClipContextMenu(e, clip.id)}
          >
            {!isImage ? (
              <video
                ref={clip.id === activeVideoClipId ? videoRef : null}
                src={clip.url || undefined}
                className="w-full h-full object-contain"
                preload="auto" playsInline
                muted={clip.id !== activeVideoClipId}
                onTimeUpdate={(e) => handleVideoTimeUpdate(e, clip.id)}
                onPlay={() => { if (clip.id === activeVideoClipId) onPlayingChange?.(true); }}
                onPause={() => { if (clip.id === activeVideoClipId) onPlayingChange?.(false); }}
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <img src={clip.url || undefined} alt={clip.name} className="w-full h-full object-contain" style={{ pointerEvents: 'none' }} />
            )}

            {/* Selection handles */}
            {isClipSelected && (
              <>
                <div className="absolute pointer-events-none" style={{
                  inset: -4, border: '2px dashed #00D4D4', borderRadius: 4,
                  boxShadow: '0 0 8px rgba(0,212,212,0.3)',
                }} />
                {(['top-left','top-right','bottom-left','bottom-right'] as const).map(pos => (
                  <div
                    key={pos}
                    className="absolute w-4 h-4 bg-primary border-2 border-white rounded-sm z-[120]"
                    style={{
                      cursor: pos.includes('left') ? (pos.includes('top') ? 'nwse-resize' : 'nesw-resize') : (pos.includes('top') ? 'nesw-resize' : 'nwse-resize'),
                      ...(pos.includes('top') ? { top: -8 } : { bottom: -8 }),
                      ...(pos.includes('left') ? { left: -8 } : { right: -8 }),
                    }}
                    onPointerDown={(e) => startDrag(e, clip, 'resize')}
                  />
                ))}
                <div className="absolute left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center" style={{ top: -36 }}>
                  <div
                    className="w-5 h-5 rounded-full bg-green-400 border-2 border-white cursor-alias flex items-center justify-center"
                    style={{ boxShadow: '0 0 6px rgba(74,222,128,0.5)' }}
                    onPointerDown={(e) => startDrag(e, clip, 'rotate')}
                  >
                    <span className="text-[9px] text-white font-bold">↻</span>
                  </div>
                  <div className="w-px h-4 bg-green-400/60" />
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
});

const SubtitleOverlay = React.memo(({
  activeSubtitleClips,
  selectedClipIds,
  onClipSelect,
  onClipUpdate,
  handleClipContextMenu,
  canvasAspectRatio = '16:9',
  onInteractionStart,
  onInteractionEnd,
}: {
  activeSubtitleClips: VideoClip[],
  selectedClipIds: string[],
  onClipSelect?: (ids: string[]) => void,
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void,
  handleClipContextMenu: (e: React.MouseEvent, clipId: string) => void,
  canvasAspectRatio?: '16:9' | '9:16' | '1:1' | '3:4',
  onInteractionStart?: () => void,
  onInteractionEnd?: () => void,
}) => {
  const aspectScaleMap: Record<string, number> = { '16:9': 1, '9:16': 0.56, '1:1': 0.75, '3:4': 0.65 };
  const aspectScale = aspectScaleMap[canvasAspectRatio] || 1;
  const DRAG_THRESHOLD = 5;

  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const editRef = useRef<HTMLSpanElement | null>(null);

  // Clear editing when clip is deselected
  useEffect(() => {
    if (editingClipId && !selectedClipIds.includes(editingClipId)) {
      setEditingClipId(null);
    }
  }, [selectedClipIds, editingClipId]);

  const dragRef = useRef<{
    type: 'move' | 'resize' | 'rotate';
    clipId: string;
    startX: number; startY: number;
    origX: number; origY: number;
    origScale: number; origRotation: number;
    centerX: number; centerY: number;
    dragging: boolean;
  } | null>(null);

  const onClipUpdateRef = useRef(onClipUpdate);
  onClipUpdateRef.current = onClipUpdate;
  const onInteractionStartRef = useRef(onInteractionStart);
  onInteractionStartRef.current = onInteractionStart;
  const onInteractionEndRef = useRef(onInteractionEnd);
  onInteractionEndRef.current = onInteractionEnd;

  // Use window-level listeners for reliable drag
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !onClipUpdateRef.current) return;
      if (!d.dragging) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.dragging = true;
        onInteractionStartRef.current?.();
      }
      if (d.type === 'move') {
        onClipUpdateRef.current(d.clipId, {
          positionX: d.origX + (e.clientX - d.startX),
          positionY: d.origY + (e.clientY - d.startY),
        });
      } else if (d.type === 'resize') {
        const startDist = Math.hypot(d.startX - d.centerX, d.startY - d.centerY);
        const curDist = Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY);
        const ratio = startDist > 0 ? curDist / startDist : 1;
        onClipUpdateRef.current(d.clipId, { scale: Math.max(20, Math.round(d.origScale * ratio)) });
      } else if (d.type === 'rotate') {
        const startAngle = Math.atan2(d.startY - d.centerY, d.startX - d.centerX);
        const curAngle = Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX);
        const deg = (curAngle - startAngle) * (180 / Math.PI);
        onClipUpdateRef.current(d.clipId, { rotation: Math.round(d.origRotation + deg) });
      }
    };
    const onUp = () => {
      if (dragRef.current?.dragging) onInteractionEndRef.current?.();
      dragRef.current = null;
    };
    // pointercancel: 터치 중단·시스템 인터럽트 등으로 포인터 이벤트가 취소될 때
    const onCancel = () => { dragRef.current = null; };
    // 탭 전환·포커스 이탈로 pointerup이 오지 않을 때 강제 종료
    const onBlur = () => { if (dragRef.current?.dragging) onInteractionEndRef.current?.(); dragRef.current = null; };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const startDrag = useCallback((e: React.PointerEvent, clip: VideoClip, type: 'move' | 'resize' | 'rotate') => {
    e.stopPropagation();
    e.preventDefault();
    if (type === 'move') onClipSelect?.([clip.id]);
    const box = (e.currentTarget as HTMLElement).closest('[data-subtitle-box]') as HTMLElement;
    const rect = box?.getBoundingClientRect();
    dragRef.current = {
      type,
      clipId: clip.id,
      startX: e.clientX, startY: e.clientY,
      origX: clip.positionX ?? 0, origY: clip.positionY ?? 0,
      origScale: clip.scale ?? 100, origRotation: clip.rotation ?? 0,
      centerX: rect ? rect.left + rect.width / 2 : e.clientX,
      centerY: rect ? rect.top + rect.height / 2 : e.clientY,
      dragging: false,
    };
  }, [onClipSelect]);

  return (
    <>
      {activeSubtitleClips.map(clip => {
        const selected = selectedClipIds.includes(clip.id);

        // 애니메이션 클래스 계산 (IN 프리셋 기준)
        const inPreset = clip.subtitleAnimationPreset as keyof typeof ANIMATION_CSS_CLASS | undefined;
        const animClass = inPreset && inPreset !== 'none' && ANIMATION_CSS_CLASS[inPreset]
          ? ANIMATION_CSS_CLASS[inPreset]
          : '';
        const animDuration = clip.subtitleAnimationDuration ?? 0.3;

        return (
          <div
            key={clip.id}
            data-subtitle-box
            className={`absolute left-1/2 -translate-x-1/2 bottom-[12%] z-[110] max-w-[80%] text-center transition-none select-none${animClass ? ` ${animClass}` : ''}`}
            style={{
              transform: `translate(${clip.positionX ?? 0}px, ${clip.positionY ?? 0}px) translateX(-50%) rotate(${clip.rotation ?? 0}deg) scale(${(clip.scale ?? 100) / 100})`,
              left: '50%',
              cursor: selected ? 'grab' : 'pointer',
              '--anim-duration': `${animDuration}s`,
            } as React.CSSProperties}
            onClick={(e) => { e.stopPropagation(); if (editingClipId !== clip.id) onClipSelect?.([clip.id]); }}
            onPointerDown={(e) => { if (editingClipId !== clip.id) startDrag(e, clip, 'move'); }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onClipSelect?.([clip.id]);
              setEditingClipId(clip.id);
              setTimeout(() => {
                if (editRef.current) {
                  editRef.current.focus();
                  const sel = window.getSelection();
                  if (sel) {
                    const range = document.createRange();
                    range.selectNodeContents(editRef.current);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  }
                }
              }, 0);
            }}
            onContextMenu={(e) => handleClipContextMenu(e, clip.id)}
          >
            {/* Bounding box when selected */}
            {selected && (
              <>
                <div className="absolute pointer-events-none" style={{
                  inset: -6,
                  border: '2px dashed #00D4D4',
                  borderRadius: 4,
                  boxShadow: '0 0 8px rgba(0,212,212,0.3)',
                }} />
                {/* Corner resize handles */}
                {(['top-left','top-right','bottom-left','bottom-right'] as const).map(pos => (
                  <div
                    key={pos}
                    className="absolute w-4 h-4 bg-primary border-2 border-white rounded-sm z-[120]"
                    style={{
                      cursor: pos.includes('left') ? (pos.includes('top') ? 'nwse-resize' : 'nesw-resize') : (pos.includes('top') ? 'nesw-resize' : 'nwse-resize'),
                      ...(pos.includes('top') ? { top: -10 } : { bottom: -10 }),
                      ...(pos.includes('left') ? { left: -10 } : { right: -10 }),
                    }}
                    onPointerDown={(e) => startDrag(e, clip, 'resize')}
                  />
                ))}
                {/* Rotate handle (top center) */}
                <div className="absolute left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center" style={{ top: -36 }}>
                  <div
                    className="w-5 h-5 rounded-full bg-green-400 border-2 border-white cursor-alias flex items-center justify-center"
                    style={{ boxShadow: '0 0 6px rgba(74,222,128,0.5)' }}
                    onPointerDown={(e) => startDrag(e, clip, 'rotate')}
                  >
                    <span className="text-[9px] text-white font-bold">↻</span>
                  </div>
                  <div className="w-px h-4 bg-green-400/60" />
                </div>
              </>
            )}
            {/* Subtitle text */}
            <div style={{
              padding: '4px 12px',
              borderRadius: 4,
              backgroundColor: clip.backgroundColor || 'transparent',
              border: clip.borderWidth ? `${clip.borderWidth}px solid ${clip.borderColor || 'transparent'}` : 'none',
            }}>
              <span
                ref={editingClipId === clip.id ? editRef : undefined}
                contentEditable={editingClipId === clip.id}
                suppressContentEditableWarning
                onBlur={(e) => {
                  if (editingClipId === clip.id) {
                    const newText = e.currentTarget.textContent || '';
                    onClipUpdate?.(clip.id, { name: newText });
                    setEditingClipId(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.currentTarget.blur();
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                  e.stopPropagation();
                }}
                style={{
                  color: clip.color || '#FFFFFF',
                  fontFamily: clip.fontFamily || 'PaperlogyExtraBold, sans-serif',
                  fontWeight: clip.fontWeight || 800,
                  fontSize: `${Math.round((clip.fontSize || 47) * aspectScale)}px`,
                  lineHeight: 1.3,
                  whiteSpace: 'pre-wrap',
                  textShadow: clip.glowColor
                    ? `0 0 ${clip.shadowBlur || 0}px ${clip.glowColor}, 0 0 ${(clip.shadowBlur || 0) * 2}px ${clip.glowColor}`
                    : (clip.shadowBlur || 0) > 0
                      ? `${clip.shadowOffsetX || 0}px ${clip.shadowOffsetY || 0}px ${clip.shadowBlur || 0}px ${clip.shadowColor || 'transparent'}`
                      : 'none',
                  WebkitTextStroke: (clip.strokeWidth || 0) > 0 ? `${clip.strokeWidth}px ${clip.strokeColor || '#000000'}` : 'none',
                  pointerEvents: editingClipId === clip.id ? 'auto' : 'none',
                  outline: 'none',
                  cursor: editingClipId === clip.id ? 'text' : 'inherit',
                  caretColor: editingClipId === clip.id ? '#00D4D4' : 'transparent',
                  minWidth: editingClipId === clip.id ? '20px' : undefined,
                }}>
                {/* trackIndex 0(대본) 또는 5~8(AI자막)은 텍스트 클립 — url 없이 name을 직접 렌더링 */}
                {(clip.trackIndex === 0 || (clip.trackIndex >= 5 && clip.trackIndex <= 8))
                  ? clip.name
                  : (!clip.url && !clip.name.match(/\.(mp4|mov|webm|m4v|jpg|jpeg|png|gif|webp|svg)/i) ? clip.name : null)}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
});


interface PlayerProps {
  videoUrl?: string;
  currentTime?: number;
  hoverTime?: number | null;
  selectedClipIds?: string[];
  clips?: VideoClip[];
  isPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onTimeUpdate?: (time: number) => void;
  onSeek?: (time: number) => void;
  onClipSelect?: (clipIds: string[]) => void;
  onClipDelete?: (clipId: string) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  videoRefCallback?: (ref: HTMLVideoElement | null) => void;
  onPresetDrop?: (preset: SubtitlePreset, x: number, y: number) => void;
  onFileDrop?: (files: File[]) => void;
  viewerZoom?: number;
  onViewerZoomChange?: (zoom: number) => void;
  playbackQuality?: 'auto' | 'high' | 'medium' | 'low';
  onPlaybackQualityChange?: (q: 'auto' | 'high' | 'medium' | 'low') => void;
  canvasAspectRatio?: '16:9' | '9:16' | '1:1' | '3:4';
  onAspectRatioChange?: (ratio: '16:9' | '9:16' | '1:1' | '3:4') => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const Player = React.memo(({
  videoUrl,
  currentTime: externalCurrentTime,
  hoverTime,
  selectedClipIds = [],
  clips = [],
  isPlaying = false,
  onPlayingChange,
  onTimeUpdate,
  onSeek,
  onClipSelect,
  onClipDelete,
  onClipUpdate,
  videoRefCallback,
  onPresetDrop,
  onFileDrop,
  viewerZoom = 100,
  onViewerZoomChange,
  playbackQuality = 'auto',
  onPlaybackQualityChange,
  canvasAspectRatio = '16:9',
  onAspectRatioChange,
  onInteractionStart,
  onInteractionEnd,
}: PlayerProps) => {
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipIds: string[] } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerAreaRef = useRef<HTMLDivElement>(null);
  const [viewerAreaSize, setViewerAreaSize] = useState({ w: 0, h: 0 });
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const lastUpdateRef = useRef(0);
  const lastSeekTimeRef = useRef(0);

  const currentTime = externalCurrentTime !== undefined ? externalCurrentTime : internalCurrentTime;
  const displayTime = hoverTime !== null && hoverTime !== undefined ? hoverTime : currentTime;

  // Track viewer area size with ResizeObserver for responsive canvas
  useEffect(() => {
    const el = viewerAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewerAreaSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute canvas size to fit inside viewer area while maintaining aspect ratio
  const canvasSize = React.useMemo(() => {
    const pad = 16; // p-2 = 8px each side
    const areaW = viewerAreaSize.w - pad;
    const areaH = viewerAreaSize.h - pad;
    if (areaW <= 0 || areaH <= 0) return { width: '100%', maxHeight: '100%', aspectRatio: '16 / 9' };
    const arMap: Record<string, number> = { '16:9': 16/9, '9:16': 9/16, '1:1': 1, '3:4': 3/4 };
    const ar = arMap[canvasAspectRatio] || 16/9;
    let w: number, h: number;
    if (areaW / areaH > ar) {
      h = areaH;
      w = h * ar;
    } else {
      w = areaW;
      h = w / ar;
    }
    return { width: Math.floor(w), height: Math.floor(h) };
  }, [viewerAreaSize, canvasAspectRatio]);

  // Categorize clips to avoid full array iteration on every frame
  const visualClips = React.useMemo(() => 
    clips.filter(c => !c.disabled && (c.trackIndex === 1 || (c.trackIndex >= 10 && c.trackIndex <= 14))),
    [clips]);

  const subtitleClips = React.useMemo(() => 
    clips.filter(c => !c.disabled && (c.trackIndex === 0 || (c.trackIndex >= 5 && c.trackIndex <= 8))),
    [clips]);

  // Interval-based indexing for O(1) candidate lookup (5-second buckets)
  const BUCKET_SIZE = 5;
  
  const visualIndex = React.useMemo(() => {
    const buckets: Record<number, VideoClip[]> = {};
    visualClips.forEach(clip => {
      const start = Math.floor(clip.startTime / BUCKET_SIZE);
      const end = Math.floor((clip.startTime + clip.duration) / BUCKET_SIZE);
      for (let i = start; i <= end; i++) {
        if (!buckets[i]) buckets[i] = [];
        buckets[i].push(clip);
      }
    });
    return buckets;
  }, [visualClips]);

  const subtitleIndex = React.useMemo(() => {
    const buckets: Record<number, VideoClip[]> = {};
    subtitleClips.forEach(clip => {
      const start = Math.floor(clip.startTime / BUCKET_SIZE);
      const end = Math.floor((clip.startTime + clip.duration) / BUCKET_SIZE);
      for (let i = start; i <= end; i++) {
        if (!buckets[i]) buckets[i] = [];
        buckets[i].push(clip);
      }
    });
    return buckets;
  }, [subtitleClips]);

  // Stable References to prevent layer re-render churn
  const prevVisualClipsRef = useRef<VideoClip[]>([]);
  const activeVisualClips = React.useMemo(() => {
    const bucketIdx = Math.floor(displayTime / BUCKET_SIZE);
    const candidates = visualIndex[bucketIdx] || [];
    const current = candidates
      .filter(c => displayTime >= c.startTime && displayTime < c.startTime + c.duration)
      .sort((a, b) => {
        if (a.trackIndex === 1) return -1;
        if (b.trackIndex === 1) return 1;
        return a.trackIndex - b.trackIndex;
      });

    // Stability Check: compare id AND mutable visual props
    const prev = prevVisualClipsRef.current;
    const isSameSet = current.length === prev.length &&
      current.every((c, i) =>
        c.id === prev[i].id &&
        c.scale === prev[i].scale &&
        c.positionX === prev[i].positionX &&
        c.positionY === prev[i].positionY &&
        c.rotation === prev[i].rotation &&
        c.opacity === prev[i].opacity
      );

    if (!isSameSet) prevVisualClipsRef.current = current;
    return prevVisualClipsRef.current;
  }, [visualIndex, displayTime]);

  const prevSubtitleClipsRef = useRef<VideoClip[]>([]);
  const activeSubtitleClips = React.useMemo(() => {
    const bucketIdx = Math.floor(displayTime / BUCKET_SIZE);
    const candidates = subtitleIndex[bucketIdx] || [];
    const current = candidates.filter(c => displayTime >= c.startTime && displayTime < c.startTime + c.duration);

    // Stability Check — compare id AND mutable props (scale, position, rotation, style)
    const prev = prevSubtitleClipsRef.current;
    const isSame = current.length === prev.length &&
      current.every((c, i) =>
        c.id === prev[i].id &&
        c.scale === prev[i].scale &&
        c.positionX === prev[i].positionX &&
        c.positionY === prev[i].positionY &&
        c.rotation === prev[i].rotation &&
        c.color === prev[i].color &&
        c.backgroundColor === prev[i].backgroundColor &&
        c.fontWeight === prev[i].fontWeight &&
        c.strokeColor === prev[i].strokeColor &&
        c.strokeWidth === prev[i].strokeWidth &&
        c.shadowBlur === prev[i].shadowBlur &&
        c.glowColor === prev[i].glowColor &&
        c.name === prev[i].name &&
        c.subtitleAnimationPreset === prev[i].subtitleAnimationPreset &&
        c.subtitleOutPreset === prev[i].subtitleOutPreset &&
        c.subtitleAnimationDuration === prev[i].subtitleAnimationDuration
      );

    if (!isSame) prevSubtitleClipsRef.current = current;
    return prevSubtitleClipsRef.current;
  }, [subtitleIndex, displayTime]);


  const activeVideoClip = activeVisualClips.find(c => c.url && !((c.url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || c.name.match(/\.(jpg|jpeg|png|gif|webp|svg)/i))));

  const firstVideoClip = clips.find(c => c.trackIndex === 1);
  const selectedVidClip = clips.find(c => selectedClipIds.includes(c.id));

  // Sync video ref
  useEffect(() => {
    videoRefCallback?.(videoRef.current);
  }, [videoRef.current, videoRefCallback]);

  // External play/pause sync with state machine guard
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncPlayback = async () => {
      try {
        if (isPlaying) {
          // 재생할 클립이 없으면(전부 삭제됨) 자동으로 정지
          if (!activeVideoClip) {
            onPlayingChange?.(false);
            return;
          }
          if (video.paused) await video.play();
        } else {
          if (!video.paused) video.pause();
        }
      } catch (e) {
        // Play was rejected (e.g., autoplay policy) — sync UI state back
        if (isPlaying) {
          onPlayingChange?.(false);
        }
      }
    };

    syncPlayback();
  }, [isPlaying, activeVideoClip?.id, activeVideoClip]);

  // Sync playback rate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const isVisual = (idx?: number) => idx === 1 || (idx !== undefined && idx >= 10 && idx <= 14);
    const clipToRate = isVisual(selectedVidClip?.trackIndex) ? selectedVidClip : activeVideoClip;
    video.playbackRate = clipToRate?.speed ?? 1;
  }, [activeVideoClip, selectedVidClip]);

  // External time sync - relaxed threshold during playback to avoid circular loops
  // Combined dependencies to ensure stable array size and logical grouping
  const justPausedRef = useRef(false);
  useEffect(() => {
    // 정지 직후 0.3초간 외부 seek를 무시 → 파란 선이 과거 위치로 되돌려지는 것 방지
    if (!isPlaying) {
      justPausedRef.current = true;
      const timer = setTimeout(() => { justPausedRef.current = false; }, 300);
      return () => clearTimeout(timer);
    } else {
      justPausedRef.current = false;
    }
  }, [isPlaying]);

  // trimStart/duration/startTime 변경 추적용 ref
  // Q/W로 클립을 자르면 같은 clipId라도 trimStart·startTime이 바뀜 → 강제 seek 필요
  const prevClipGeomRef = useRef<{ trimStart: number; startTime: number; duration: number } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || externalCurrentTime === undefined || !activeVideoClip || hoverTime !== null) return;

    // 정지 직후에는 외부 시간 동기화 스킵 (onPause에서 이미 올바른 위치 설정됨)
    if (justPausedRef.current) return;

    const mediaOffset = activeVideoClip.trimStart ?? 0;
    const relativeTime = (externalCurrentTime - activeVideoClip.startTime) + mediaOffset;
    const diff = Math.abs(video.currentTime - relativeTime);

    // Q/W trim 감지: trimStart·startTime·duration 중 하나라도 바뀌었으면 threshold 무시하고 강제 seek
    const prevGeom = prevClipGeomRef.current;
    const clipChanged =
      !prevGeom ||
      prevGeom.trimStart  !== (activeVideoClip.trimStart  ?? 0) ||
      prevGeom.startTime  !== activeVideoClip.startTime ||
      prevGeom.duration   !== activeVideoClip.duration;

    prevClipGeomRef.current = {
      trimStart: activeVideoClip.trimStart  ?? 0,
      startTime: activeVideoClip.startTime,
      duration:  activeVideoClip.duration,
    };

    if (clipChanged) {
      // trim/편집으로 클립 구조가 바뀌었음 → 무조건 seek (쿨다운 무시)
      video.currentTime = Math.max(0, relativeTime);
      lastSeekTimeRef.current = Date.now();
      return;
    }

    // Small cooldown after manual seek/hover to prevent state-fighting induced stutter
    if (Date.now() - lastSeekTimeRef.current < 500) return;

    // Increased threshold (0.8s) during playback to prevent "pull-back" stutters
    // Tight threshold (0.15s) when scrubbing/paused for editing precision
    const threshold = isPlaying ? 0.8 : 0.15;

    if (diff > threshold) {
      video.currentTime = relativeTime;
    }
  }, [externalCurrentTime, activeVideoClip, hoverTime, isPlaying]);

  // Sync for hover preview — rAF-throttled with video.seeking guard
  // Video seeking is fully independent from audio scrubbing (which runs in page.tsx)
  const pendingHoverSeekRef = useRef<number | null>(null);
  const hoverRafRef = useRef<number>(0);

  useEffect(() => {
    if (!videoRef.current || hoverTime == null || !activeVideoClip || isPlaying) {
      pendingHoverSeekRef.current = null;
      return;
    }
    const mediaOffset = activeVideoClip.trimStart ?? 0;
    const relativeTime = (hoverTime - activeVideoClip.startTime) + mediaOffset;
    pendingHoverSeekRef.current = relativeTime;
  }, [hoverTime, activeVideoClip, isPlaying]);

  useEffect(() => {
    const tick = () => {
      const video = videoRef.current;
      const target = pendingHoverSeekRef.current;
      if (video && target != null && !video.seeking) {
        // Only seek if the target is meaningfully different from current position
        if (Math.abs(video.currentTime - target) > 0.02) {
          video.currentTime = target;
          lastSeekTimeRef.current = Date.now();
        }
        pendingHoverSeekRef.current = null;
      }
      hoverRafRef.current = requestAnimationFrame(tick);
    };
    hoverRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(hoverRafRef.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video && activeVideoClip) {
      const h = () => {
        setTotalTime(video.duration);
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      };
      video.addEventListener('loadedmetadata', h);
      // Also trigger if already loaded
      if (video.readyState >= 1) h();
      return () => video.removeEventListener('loadedmetadata', h);
    }
  }, [activeVideoClip]);

  // video.ended 이벤트: 마지막 클립 재생 완료 또는 클립이 삭제된 뒤 영상이 끝까지 재생될 때 정지
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => {
      onPlayingChange?.(false);
    };
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [onPlayingChange]);

  const handlePlayPause = () => {
    onPlayingChange?.(!isPlaying);
  };

  const handleVideoClick = (e: React.MouseEvent, clipId?: string) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('[data-handle]')) return;
    
    if (clipId) {
      onClipSelect?.([clipId]);
    }
    else if (activeVisualClips.length > 0) onClipSelect?.([activeVisualClips[activeVisualClips.length - 1].id]);
    else if (firstVideoClip) onClipSelect?.([firstVideoClip.id]);
    else onClipSelect?.([]);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClipSelect?.([]);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedVidClip) setContextMenu({ x: e.clientX, y: e.clientY, clipIds: [selectedVidClip.id] });
    else if (activeVisualClips.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, clipIds: [activeVisualClips[activeVisualClips.length - 1].id] });
    else if (firstVideoClip) setContextMenu({ x: e.clientX, y: e.clientY, clipIds: [firstVideoClip.id] });
  };

  const [isPresetDragOver, setIsPresetDragOver] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const ACCEPTED_FILE_TYPES = ['video/', 'audio/', 'image/'];
  const isAcceptedFile = (item: DataTransferItem) =>
    item.kind === 'file' && ACCEPTED_FILE_TYPES.some(t => item.type.startsWith(t));

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/subtitle-preset')) {
      e.preventDefault();
      e.stopPropagation();
      setIsPresetDragOver(true);
      return;
    }
    // 파일 드래그 감지
    const hasFile = Array.from(e.dataTransfer.items).some(isAcceptedFile);
    if (hasFile) {
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(true);
    }
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsPresetDragOver(false);
    setIsFileDragOver(false);
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPresetDragOver(false);
    setIsFileDragOver(false);

    // 자막 프리셋 드롭
    const presetData = e.dataTransfer.getData('application/subtitle-preset');
    if (presetData && onPresetDrop) {
      try {
        const preset = JSON.parse(presetData);
        const rect = containerRef.current?.getBoundingClientRect();
        const x = rect ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
        const y = rect ? ((e.clientY - rect.top) / rect.height) * 100 : 50;
        onPresetDrop(preset, x, y);
      } catch { }
      return;
    }

    // 파일 드롭
    if (onFileDrop && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(f =>
        ACCEPTED_FILE_TYPES.some(t => f.type.startsWith(t))
      );
      if (files.length > 0) onFileDrop(files);
    }
  }, [onPresetDrop, onFileDrop]);

  const handleClipContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clipIds: [clipId] });
  }, []);

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>, clipId: string) => {
    if (clipId === activeVideoClip?.id && hoverTime === null) {
      const mediaOffset = activeVideoClip.trimStart ?? 0;
      const time = activeVideoClip.startTime + (e.currentTarget.currentTime - mediaOffset);
      // Throttle updates: 33ms (30fps) for smooth playhead movement
      const now = Date.now();
      const throttleLimit = 33;
      
      if (now - lastUpdateRef.current > throttleLimit) {
        setInternalCurrentTime(time);
        onTimeUpdate?.(time);
        lastUpdateRef.current = now;
      }
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-black relative min-h-0 min-w-0 h-full w-full">
      <div className="flex-1 flex items-center justify-center p-2 bg-editor-bg overflow-hidden min-h-0 min-w-0" ref={viewerAreaRef} onClick={handleCanvasClick}>
        <div
          ref={containerRef}
          className={`bg-black shadow-2xl relative group overflow-visible transition-all duration-200 ${isPresetDragOver ? 'border-2 border-[#00D4D4] border-dashed shadow-lg shadow-[#00D4D4]/30'
            : isFileDragOver ? 'border-2 border-blue-400 border-dashed shadow-lg shadow-blue-400/30'
            : 'border border-border-color/30'
            }`}
          onClick={(e) => handleVideoClick(e)}
          onContextMenu={handleContextMenu}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
          style={{
            transformOrigin: 'center center',
            ...canvasSize,
            backgroundColor: '#000',
            position: 'relative',
          }}
        >
          <div className="absolute inset-0 overflow-hidden" style={{ transform: `scale(${viewerZoom / 100})` }}>
            {activeVisualClips.length > 0 ? (
              <VisualLayer
                activeVisualClips={activeVisualClips}
                activeVideoClipId={activeVideoClip?.id}
                selectedClipIds={selectedClipIds}
                videoRef={videoRef}
                handleVideoTimeUpdate={handleVideoTimeUpdate}
                handleVideoClick={handleVideoClick}
                handleClipContextMenu={handleClipContextMenu}
                onPlayingChange={onPlayingChange}
                onClipSelect={onClipSelect}
                onClipUpdate={onClipUpdate}
                canvasAspectRatio={canvasAspectRatio}
                containerRef={containerRef}
                onInteractionStart={onInteractionStart}
                onInteractionEnd={onInteractionEnd}
              />
            ) : (
              <div
                className={`w-full h-full flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${isFileDragOver ? 'bg-blue-900/40' : 'bg-gray-900 hover:bg-gray-800'}`}
                onDoubleClick={() => {}}
              >
                <span className={`material-icons text-6xl transition-colors ${isFileDragOver ? 'text-blue-400' : 'text-gray-600'}`}>
                  {isFileDragOver ? 'file_download' : 'play_circle_outline'}
                </span>
                <span className={`text-sm font-medium transition-colors ${isFileDragOver ? 'text-blue-300' : 'text-gray-500'}`}>
                  {isFileDragOver ? '여기에 놓으면 추가됩니다' : '더블클릭 또는 파일을 드래그하여 추가'}
                </span>
                <span className="text-gray-600 text-xs">동영상, 사진, 오디오, 자막 파일 지원</span>
              </div>
            )}
          </div>

          <SubtitleOverlay
            activeSubtitleClips={activeSubtitleClips}
            selectedClipIds={selectedClipIds}
            onClipSelect={onClipSelect}
            onClipUpdate={onClipUpdate}
            handleClipContextMenu={handleClipContextMenu}
            canvasAspectRatio={canvasAspectRatio}
            onInteractionStart={onInteractionStart}
            onInteractionEnd={onInteractionEnd}
          />


          {isPresetDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-30">
              <span className="text-white text-sm font-medium bg-[#00D4D4]/20 px-4 py-2 rounded-lg border border-[#00D4D4]/50">
                여기에 놓아 텍스트 추가
              </span>
            </div>
          )}

          {isFileDragOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-900/30 pointer-events-none z-30 border-2 border-blue-400 border-dashed rounded">
              <span className="material-icons text-blue-300 text-5xl mb-2">file_download</span>
              <span className="text-blue-200 text-sm font-semibold">파일을 놓으면 라이브러리에 추가됩니다</span>
              <span className="text-blue-400 text-xs mt-1">동영상 · 사진 · 오디오</span>
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
            <button
              onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
              className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-transform active:scale-95 pointer-events-auto"
            >
              <span className="material-icons text-white text-3xl">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
          </div>

        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            if (contextMenu?.clipIds?.[0] && onClipDelete) {
              onClipDelete(contextMenu.clipIds[0]);
              setContextMenu(null);
              onClipSelect?.([]);
            }
          }}
        />
      )}

      {/* Info Overlay inside Canvas - Premium Glassmorphism Look */}
      {activeVideoClip && (
        <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-none z-50 group/info transition-all hover:bg-black/60">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold tracking-tight text-white/90 font-mono">
              {videoDimensions.width > 0 ? `${videoDimensions.width}x${videoDimensions.height}` : '...'}
            </span>
          </div>
          <div className="w-px h-2.5 bg-white/20" />
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/60 font-medium">30.00</span>
            <span className="text-[9px] text-white/30 font-bold">FPS</span>
          </div>
        </div>
      )}

      <div className="h-10 bg-editor-bg border-t border-border-color flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center space-x-3 w-1/3">
          <div className="relative">
            <button
              onClick={() => setShowAspectMenu(prev => !prev)}
              className="flex items-center gap-1 text-gray-400 hover:text-white transition-all bg-gray-800/50 px-1.5 py-0.5 rounded border border-gray-700 hover:border-primary/50"
              title="화면 비율"
            >
              <span className="material-icons text-sm text-primary">aspect_ratio</span>
              <span className="text-[10px] font-bold font-mono">{canvasAspectRatio}</span>
            </button>
            {showAspectMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 w-24">
                {(['16:9', '9:16', '1:1', '3:4'] as const).map(ratio => (
                  <button
                    key={ratio}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#00D4D4]/10 flex items-center justify-between ${canvasAspectRatio === ratio ? 'text-[#00D4D4]' : 'text-white'}`}
                    onClick={() => { onAspectRatioChange?.(ratio); setShowAspectMenu(false); }}
                  >
                    <span className="font-mono">{ratio}</span>
                    {canvasAspectRatio === ratio && <span className="material-icons text-xs">check</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-primary">{formatTime(currentTime)}</span>
            <span className="text-xs font-mono text-text-secondary">/ {formatTime(totalTime)}</span>
          </div>
        </div>
        <div className="flex items-center space-x-4 w-1/3 justify-center">
          <button onClick={() => onSeek?.(Math.max(0, currentTime - 5))} className="text-white hover:text-primary transition-all active:scale-90" title="5초 뒤로">
            <span className="material-icons text-lg">skip_previous</span>
          </button>
          <button onClick={handlePlayPause} className="text-white hover:text-primary transition-transform active:scale-90" title={isPlaying ? '일시정지' : '재생'}>
            <span className={`material-icons text-2xl ${isPlaying ? 'text-primary' : ''}`}>
              {isPlaying ? 'pause_circle_filled' : 'play_circle_filled'}
            </span>
          </button>
          <button onClick={() => onSeek?.(Math.min(totalTime, currentTime + 5))} className="text-white hover:text-primary transition-all active:scale-90" title="5초 앞으로">
            <span className="material-icons text-lg">skip_next</span>
          </button>
        </div>
        <div className="flex items-center justify-end space-x-3 w-1/3">
          <div className="flex items-center gap-1">
            <button onClick={() => onViewerZoomChange?.(Math.max(25, viewerZoom - 25))} className="text-gray-400 hover:text-white transition-all active:scale-90" title="뷰어 축소">
              <span className="material-icons text-xs">remove</span>
            </button>
            <span className="text-[9px] text-gray-400 font-mono w-7 text-center">{viewerZoom}%</span>
            <button onClick={() => onViewerZoomChange?.(Math.min(200, viewerZoom + 25))} className="text-gray-400 hover:text-white transition-all active:scale-90" title="뷰어 확대">
              <span className="material-icons text-xs">add</span>
            </button>
            <button onClick={() => onViewerZoomChange?.(100)} className={`text-[9px] px-1 py-0.5 rounded transition-all ${viewerZoom === 100 ? 'text-[#00D4D4]' : 'text-gray-500 hover:text-white'}`} title="뷰어 100%">
              <span className="material-icons text-xs">fit_screen</span>
            </button>
          </div>
          <div className="w-px h-3 bg-gray-700" />
          <div className="relative">
            <button
              onClick={() => setShowQualityMenu(prev => !prev)}
              className="flex items-center gap-0.5 text-gray-400 hover:text-white transition-all"
              title="재생 화질"
            >
              <span className="material-icons text-sm">settings</span>
              <span className="text-[9px] font-medium">
                {playbackQuality === 'auto' ? 'Auto' : playbackQuality === 'high' ? 'HD' : playbackQuality === 'medium' ? 'SD' : 'LD'}
              </span>
            </button>
            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 w-32">
                <div className="px-3 py-1 text-[10px] text-gray-500 font-semibold">재생 화질</div>
                {(['auto', 'high', 'medium', 'low'] as const).map(q => (
                  <button
                    key={q}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#00D4D4]/10 flex items-center justify-between ${playbackQuality === q ? 'text-[#00D4D4]' : 'text-white'}`}
                    onClick={() => { onPlaybackQualityChange?.(q); setShowQualityMenu(false); }}
                  >
                    <span>{q === 'auto' ? '자동' : q === 'high' ? '고화질 (HD)' : q === 'medium' ? '중간 (SD)' : '저화질 (LD)'}</span>
                    {playbackQuality === q && <span className="material-icons text-xs">check</span>}
                  </button>
                ))}
                <div className="border-t border-gray-700 mt-1 pt-1 px-3 py-1">
                  <span className="text-[9px] text-gray-500">낮은 화질 = 빠른 재생</span>
                </div>
              </div>
            )}
          </div>
          <div className="w-px h-3 bg-gray-700" />
          <button className="text-white hover:text-primary transition-all" title="Fullscreen"
            onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else containerRef.current?.closest('main')?.requestFullscreen(); }}>
            <span className="material-icons text-sm">fullscreen</span>
          </button>
        </div>
      </div>
    </main>
  );
});

export default Player;

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}
