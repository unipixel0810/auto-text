'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ContextMenu from '@/components/ui/ContextMenu';
import type { VideoClip } from '@/types/video';
import type { SubtitlePreset } from '@/lib/subtitlePresets';
import { ANIMATION_CSS_CLASS } from '@/components/editor/SubtitleAnimationPanel';

// Global flag: when a guide line is being dragged, subtitle drag must be suppressed
let _guideDragActive = false;
let _guideIdCounter = 0;
interface GuideLine { id: number; pct: number; }

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
          // ★ key를 URL 기반으로 고정 — 장면 분할 클립 경계에서 DOM 재생성 방지
          // (같은 영상 파일의 분할 클립은 같은 <video> 엘리먼트를 재사용)
          return (
            <div
              key={`main-${clip.url}`}
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
                  ref={videoRef}
                  src={clip.url || undefined}
                  className="w-full h-full object-contain"
                  preload="auto" playsInline
                  muted={false}
                  onTimeUpdate={(e) => handleVideoTimeUpdate(e, clip.id)}
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
            {(() => {
              // Build CSS filter string from clip color correction properties
              const filters: string[] = [];
              if (clip.brightness != null && clip.brightness !== 100) filters.push(`brightness(${clip.brightness / 100})`);
              if (clip.contrast != null && clip.contrast !== 100) filters.push(`contrast(${clip.contrast / 100})`);
              if (clip.saturate != null && clip.saturate !== 100) filters.push(`saturate(${clip.saturate / 100})`);
              if (clip.temperature != null && clip.temperature !== 0) filters.push(`hue-rotate(${clip.temperature}deg)`);
              if (clip.sharpen != null && clip.sharpen > 0) {
                // CSS doesn't have a native sharpen — approximate with slight contrast boost
                const sharpContrast = 1 + (clip.sharpen / 200);
                filters.push(`contrast(${sharpContrast})`);
              }
              const filterStr = filters.length > 0 ? filters.join(' ') : undefined;
              const mediaStyle: React.CSSProperties = { pointerEvents: 'none', filter: filterStr };

              return !isImage ? (
                <video
                  ref={clip.id === activeVideoClipId ? videoRef : null}
                  src={clip.url || undefined}
                  className="w-full h-full object-contain"
                  preload="auto" playsInline
                  muted={clip.id !== activeVideoClipId}
                  onTimeUpdate={(e) => handleVideoTimeUpdate(e, clip.id)}
                  style={mediaStyle}
                />
              ) : (
                <img src={clip.url || undefined} alt={clip.name} className="w-full h-full object-contain" style={mediaStyle} />
              );
            })()}

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
  activeSafeZones,
  guideLinesH,
  guideLinesV,
  containerRef,
}: {
  activeSubtitleClips: VideoClip[],
  selectedClipIds: string[],
  onClipSelect?: (ids: string[]) => void,
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void,
  handleClipContextMenu: (e: React.MouseEvent, clipId: string) => void,
  canvasAspectRatio?: '16:9' | '9:16' | '1:1' | '3:4',
  onInteractionStart?: () => void,
  onInteractionEnd?: () => void,
  activeSafeZones?: Set<SafeZonePlatform>,
  guideLinesH?: GuideLine[],
  guideLinesV?: GuideLine[],
  containerRef?: React.RefObject<HTMLDivElement | null>,
}) => {
  const aspectScaleMap: Record<string, number> = { '16:9': 1, '9:16': 0.42, '1:1': 0.7, '3:4': 0.55 };
  const aspectScale = aspectScaleMap[canvasAspectRatio] || 1;
  const isPortrait = canvasAspectRatio === '9:16' || canvasAspectRatio === '3:4';
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
    boxTop: number; boxBottom: number; boxLeft: number; boxRight: number;
  } | null>(null);

  const onClipUpdateRef = useRef(onClipUpdate);
  onClipUpdateRef.current = onClipUpdate;
  const onInteractionStartRef = useRef(onInteractionStart);
  onInteractionStartRef.current = onInteractionStart;
  const onInteractionEndRef = useRef(onInteractionEnd);
  onInteractionEndRef.current = onInteractionEnd;

  // 가이드 라인 스냅 refs
  const guideLinesHRef = useRef(guideLinesH);
  guideLinesHRef.current = guideLinesH;
  const guideLinesVRef = useRef(guideLinesV);
  guideLinesVRef.current = guideLinesV;
  const containerRefLocal = containerRef;

  // Use window-level listeners for reliable drag
  useEffect(() => {
    const SNAP_THRESHOLD_PX = 14; // 스냅 거리 (px)
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !onClipUpdateRef.current) return;
      // Skip subtitle drag if a guide line is being dragged
      if (_guideDragActive) { dragRef.current = null; return; }
      if (!d.dragging) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.dragging = true;
        onInteractionStartRef.current?.();
      }
      if (d.type === 'move') {
        let newX = d.origX + (e.clientX - d.startX);
        let newY = d.origY + (e.clientY - d.startY);

        // 가이드 라인 자석 스냅 — 자막 박스의 상/하/좌/우 가장자리 기준
        const container = containerRefLocal?.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const dx = e.clientX - d.startX;
          const dy = e.clientY - d.startY;
          // 자막 박스의 현재 스크린 좌표 (초기 박스 + 이동량)
          const boxTop = d.boxTop + dy;
          const boxBottom = d.boxBottom + dy;
          const boxLeft = d.boxLeft + dx;
          const boxRight = d.boxRight + dx;

          // 가로 가이드 스냅 (Y축) — 박스 상단/하단 가장자리가 라인에 닿으면 흡착
          const hLines = guideLinesHRef.current;
          if (hLines && hLines.length > 0) {
            let closestDist = Infinity;
            let snapDelta = 0;
            for (const gl of hLines) {
              const lineY = rect.top + (gl.pct / 100) * rect.height;
              const distTop = Math.abs(boxTop - lineY);
              const distBottom = Math.abs(boxBottom - lineY);
              if (distTop < closestDist) { closestDist = distTop; snapDelta = lineY - boxTop; }
              if (distBottom < closestDist) { closestDist = distBottom; snapDelta = lineY - boxBottom; }
            }
            if (closestDist < SNAP_THRESHOLD_PX) {
              newY += snapDelta;
            }
          }
          // 세로 가이드 스냅 (X축) — 박스 좌측/우측 가장자리가 라인에 닿으면 흡착
          const vLines = guideLinesVRef.current;
          if (vLines && vLines.length > 0) {
            let closestDist = Infinity;
            let snapDelta = 0;
            for (const gl of vLines) {
              const lineX = rect.left + (gl.pct / 100) * rect.width;
              const distLeft = Math.abs(boxLeft - lineX);
              const distRight = Math.abs(boxRight - lineX);
              if (distLeft < closestDist) { closestDist = distLeft; snapDelta = lineX - boxLeft; }
              if (distRight < closestDist) { closestDist = distRight; snapDelta = lineX - boxRight; }
            }
            if (closestDist < SNAP_THRESHOLD_PX) {
              newX += snapDelta;
            }
          }
        }

        onClipUpdateRef.current(d.clipId, { positionX: newX, positionY: newY });
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
    // Block subtitle drag if a guide line drag is active
    if (_guideDragActive) return;
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
      boxTop: rect ? rect.top : e.clientY,
      boxBottom: rect ? rect.bottom : e.clientY,
      boxLeft: rect ? rect.left : e.clientX,
      boxRight: rect ? rect.right : e.clientX,
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

        // 세로 영상 + safe zone 활성 시 safe zone 안에 자막 배치
        let bottomPos = isPortrait ? '18%' : '3%';
        let safeMaxWidth = isPortrait ? '92%' : '92%';

        if (isPortrait && activeSafeZones && activeSafeZones.size > 0) {
          let maxBottom = 0;
          let maxLeft = 0;
          let maxRight = 0;
          activeSafeZones.forEach(p => {
            const cfg = SAFE_ZONE_CONFIG[p];
            if (cfg) {
              if (cfg.bottom > maxBottom) maxBottom = cfg.bottom;
              if (cfg.left > maxLeft) maxLeft = cfg.left;
              if (cfg.right > maxRight) maxRight = cfg.right;
            }
          });
          bottomPos = `${maxBottom + 1}%`;
          safeMaxWidth = `${100 - maxLeft - maxRight - 2}%`;
        }

        // Track 6 = 썸네일 타이틀 (화면 상단 배치)
        const isTopTitle = clip.trackIndex === 6;

        return (
          <div
            key={clip.id}
            data-subtitle-box
            className={`absolute left-1/2 -translate-x-1/2 z-[110] text-center transition-none select-none overflow-hidden${animClass ? ` ${animClass}` : ''}`}
            style={{
              ...(isTopTitle ? { top: '8%' } : { bottom: bottomPos }),
              maxWidth: safeMaxWidth,
              transform: `translate(${clip.positionX ?? 0}px, ${clip.positionY ?? 0}px) translateX(-50%) rotate(${clip.rotation ?? 0}deg) scale(${(clip.scale ?? 100) / 100})`,
              left: '50%',
              cursor: selected ? 'grab' : 'pointer',
              '--anim-duration': `${animDuration}s`,
            } as unknown as React.CSSProperties}
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
                  fontSize: `${Math.round((clip.fontSize || 40) * aspectScale)}px`,
                  lineHeight: clip.lineHeight ?? 1.35,
                  letterSpacing: clip.letterSpacing !== undefined ? `${clip.letterSpacing}em` : '0.02em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  textShadow: clip.glowColor
                    ? `0 0 ${clip.shadowBlur || 6}px ${clip.glowColor}, 0 0 ${(clip.shadowBlur || 6) * 2}px ${clip.glowColor}`
                    : `2px 2px ${clip.shadowBlur ?? 8}px ${clip.shadowColor || 'rgba(0,0,0,0.9)'}, -1px -1px 4px rgba(0,0,0,0.5)`,
                  WebkitTextStroke: `${clip.strokeWidth ?? 3}px ${clip.strokeColor || '#000000'}`,
                  paintOrder: 'stroke fill',
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
  onLibraryItemDrop?: (libraryItemId: string) => void;
  viewerZoom?: number;
  onViewerZoomChange?: (zoom: number) => void;
  playbackQuality?: 'auto' | 'high' | 'medium' | 'low';
  onPlaybackQualityChange?: (q: 'auto' | 'high' | 'medium' | 'low') => void;
  canvasAspectRatio?: '16:9' | '9:16' | '1:1' | '3:4';
  onAspectRatioChange?: (ratio: '16:9' | '9:16' | '1:1' | '3:4') => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  isDraggingPlayhead?: boolean;
}

// Safe Zone definitions for vertical (9:16) content
type SafeZonePlatform = 'tiktok' | 'instagram' | 'youtube';

const SAFE_ZONE_CONFIG: Record<SafeZonePlatform, {
  label: string;
  color: string;
  icon: string;
  // % from edges: top, bottom, left, right
  top: number; bottom: number; left: number; right: number;
}> = {
  tiktok: {
    label: 'TikTok',
    color: '#69C9D0',
    icon: 'T',
    top: 10,    // 상단 UI (프로필, 제목)
    bottom: 20, // 하단 UI (댓글, 버튼)
    left: 5,
    right: 20,  // 오른쪽 버튼
  },
  instagram: {
    label: 'Instagram',
    color: '#E1306C',
    icon: 'I',
    top: 12,
    bottom: 18,
    left: 5,
    right: 5,
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    icon: 'Y',
    top: 8,
    bottom: 22, // 하단 UI 버튼
    left: 5,
    right: 12,  // 우측 액션 버튼
  },
};

// SNS UI 모킹 요소
const TikTokMockUI = () => (
  <>
    {/* 우측 액션 버튼 */}
    <div className="absolute right-[3%] bottom-[25%] flex flex-col items-center gap-3">
      {/* 프로필 */}
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-8 h-8 rounded-full bg-gray-400/50 border-2 border-white/60" />
        <div className="w-4 h-4 -mt-2 rounded-full bg-[#FE2C55] flex items-center justify-center text-white text-[8px] font-bold">+</div>
      </div>
      {/* 좋아요 */}
      <div className="flex flex-col items-center">
        <span className="text-white text-xl drop-shadow">♥</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">128K</span>
      </div>
      {/* 댓글 */}
      <div className="flex flex-col items-center">
        <span className="text-white text-lg drop-shadow">💬</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">1,024</span>
      </div>
      {/* 공유 */}
      <div className="flex flex-col items-center">
        <span className="text-white text-lg drop-shadow">↗</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">공유</span>
      </div>
      {/* 음원 */}
      <div className="w-6 h-6 rounded-full bg-gray-800/80 border border-gray-500/50 animate-spin" style={{ animationDuration: '3s' }} />
    </div>
    {/* 하단 유저 정보 */}
    <div className="absolute left-[4%] bottom-[5%] right-[20%]">
      <div className="text-white text-[10px] font-bold drop-shadow mb-0.5">@channel_name</div>
      <div className="text-white/80 text-[8px] drop-shadow leading-tight">영상 설명이 여기에 표시됩니다... #해시태그 #틱톡</div>
      <div className="flex items-center gap-1 mt-1 opacity-70">
        <span className="text-white text-[8px]">♪</span>
        <div className="text-white text-[7px] truncate">원본 사운드 - channel_name</div>
      </div>
    </div>
  </>
);

const YouTubeMockUI = () => (
  <>
    {/* 우측 액션 버튼 */}
    <div className="absolute right-[3%] bottom-[28%] flex flex-col items-center gap-3">
      <div className="flex flex-col items-center">
        <span className="text-white text-xl drop-shadow">👍</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">5.2K</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-white text-xl drop-shadow">👎</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">싫어요</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-white text-lg drop-shadow">💬</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">312</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-white text-lg drop-shadow">↗</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">공유</span>
      </div>
    </div>
    {/* 하단 채널 정보 */}
    <div className="absolute left-[4%] bottom-[5%] right-[15%]">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-6 h-6 rounded-full bg-red-500/60" />
        <div className="text-white text-[10px] font-bold drop-shadow">채널명</div>
      </div>
      <div className="text-white/80 text-[8px] drop-shadow leading-tight">Shorts 영상 제목이 여기에 표시됩니다</div>
      <div className="flex items-center gap-2 mt-1">
        <div className="px-2 py-0.5 bg-white/20 rounded-full text-white text-[7px] font-semibold">구독</div>
      </div>
    </div>
  </>
);

const InstagramMockUI = () => (
  <>
    {/* 우측 액션 버튼 */}
    <div className="absolute right-[3%] bottom-[22%] flex flex-col items-center gap-3">
      <div className="flex flex-col items-center">
        <span className="text-white text-xl drop-shadow">♥</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">9,432</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-white text-lg drop-shadow">💬</span>
        <span className="text-white text-[8px] font-semibold drop-shadow">84</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-white text-lg drop-shadow">↗</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-white text-lg drop-shadow">⋯</span>
      </div>
    </div>
    {/* 하단 유저 정보 */}
    <div className="absolute left-[4%] bottom-[5%] right-[15%]">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-500 p-[1.5px]">
          <div className="w-full h-full rounded-full bg-gray-800" />
        </div>
        <div className="text-white text-[10px] font-bold drop-shadow">username</div>
        <div className="px-1.5 py-0.5 border border-white/50 rounded text-white text-[7px] font-semibold">팔로우</div>
      </div>
      <div className="text-white/80 text-[8px] drop-shadow leading-tight">릴스 설명... #인스타그램 #릴스</div>
      <div className="flex items-center gap-1 mt-1 opacity-70">
        <span className="text-white text-[8px]">♪</span>
        <div className="text-white text-[7px] truncate">원본 오디오</div>
      </div>
    </div>
  </>
);

const PLATFORM_MOCK_UI: Record<SafeZonePlatform, React.FC> = {
  tiktok: TikTokMockUI,
  youtube: YouTubeMockUI,
  instagram: InstagramMockUI,
};

const SafeZoneOverlay = React.memo(({ activePlatforms }: { activePlatforms: Set<SafeZonePlatform> }) => {
  if (activePlatforms.size === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-[115]">
      {Array.from(activePlatforms).map((platform) => {
        const cfg = SAFE_ZONE_CONFIG[platform];
        const MockUI = PLATFORM_MOCK_UI[platform];
        return (
          <React.Fragment key={platform}>
            {/* Safe zone border */}
            <div
              className="absolute"
              style={{
                top: `${cfg.top}%`,
                bottom: `${cfg.bottom}%`,
                left: `${cfg.left}%`,
                right: `${cfg.right}%`,
                border: `1.5px dashed ${cfg.color}`,
                borderRadius: 4,
                opacity: 0.7,
              }}
            />
            {/* Platform label */}
            <div
              className="absolute text-[9px] font-bold px-1 py-0.5 rounded"
              style={{
                top: `${cfg.top}%`,
                left: `${cfg.left}%`,
                transform: 'translateY(-100%) translateY(-2px)',
                color: cfg.color,
                background: 'rgba(0,0,0,0.55)',
                lineHeight: 1.2,
              }}
            >
              {cfg.label}
            </div>
            {/* Top unsafe zone */}
            <div
              className="absolute left-0 right-0 top-0"
              style={{
                height: `${cfg.top}%`,
                background: `${cfg.color}18`,
                borderBottom: `1px solid ${cfg.color}40`,
              }}
            />
            {/* Bottom unsafe zone */}
            <div
              className="absolute left-0 right-0 bottom-0"
              style={{
                height: `${cfg.bottom}%`,
                background: `${cfg.color}18`,
                borderTop: `1px solid ${cfg.color}40`,
              }}
            />
            {/* Right unsafe zone */}
            <div
              className="absolute top-0 bottom-0 right-0"
              style={{
                width: `${cfg.right}%`,
                background: `${cfg.color}12`,
                borderLeft: `1px solid ${cfg.color}30`,
              }}
            />
            {/* Left unsafe zone */}
            {cfg.left > 0 && (
              <div
                className="absolute top-0 bottom-0 left-0"
                style={{
                  width: `${cfg.left}%`,
                  background: `${cfg.color}12`,
                  borderRight: `1px solid ${cfg.color}30`,
                }}
              />
            )}
            {/* SNS UI 모킹 — 실제 앱처럼 채널명, 좋아요, 공유 등 표시 */}
            <MockUI />
          </React.Fragment>
        );
      })}
    </div>
  );
});

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
  onLibraryItemDrop,
  viewerZoom = 100,
  onViewerZoomChange,
  playbackQuality = 'auto',
  onPlaybackQualityChange,
  canvasAspectRatio = '16:9',
  onAspectRatioChange,
  onInteractionStart,
  onInteractionEnd,
  isDraggingPlayhead = false,
}: PlayerProps) => {
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipIds: string[] } | null>(null);
  const [activeSafeZones, setActiveSafeZones] = useState<Set<SafeZonePlatform>>(new Set());
  const [showSafeZoneMenu, setShowSafeZoneMenu] = useState(false);
  // 가이드 라인 기능
  const [guideLinesH, setGuideLinesH] = useState<GuideLine[]>([]); // 가로 라인들 (% from top)
  const [guideLinesV, setGuideLinesV] = useState<GuideLine[]>([]); // 세로 라인들 (% from left)
  const [guideLineMode, setGuideLineMode] = useState<'h' | 'v' | null>(null);
  const [isDraggingGuide, setIsDraggingGuide] = useState(false);
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
  // 재생 중: Player rAF(60fps)와 page.tsx rAF(20fps) 중 더 최신 값 사용
  // → 비디오가 일시정지되어 internalCurrentTime이 멈춰도 page.tsx의 wall-clock이 계속 진행
  // 정지 시: externalCurrentTime(파란 플레이헤드) 사용
  const displayTime = hoverTime !== null && hoverTime !== undefined
    ? hoverTime
    : isPlaying
      ? Math.max(internalCurrentTime, externalCurrentTime ?? 0)
      : currentTime;

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
    if (areaW <= 0 || areaH <= 0) return { width: 640, height: 360 };
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

    // Stability Check: compare visual identity AND mutable visual props
    // For main-track (trackIndex 1) clips with same url, treat as equivalent
    // for RENDERING purposes — but always update the ref with fresh clip objects
    // so that time-mapping (trimStart/startTime) stays accurate
    const prev = prevVisualClipsRef.current;
    const isSameSetForRender = current.length === prev.length &&
      current.every((c, i) => {
        const idMatch = c.id === prev[i].id ||
          (c.trackIndex === 1 && prev[i].trackIndex === 1 && c.url === prev[i].url);
        return idMatch &&
        c.scale === prev[i].scale &&
        c.positionX === prev[i].positionX &&
        c.positionY === prev[i].positionY &&
        c.rotation === prev[i].rotation &&
        c.opacity === prev[i].opacity &&
        c.fontSize === prev[i].fontSize &&
        c.lineHeight === prev[i].lineHeight &&
        c.letterSpacing === prev[i].letterSpacing &&
        c.fontFamily === prev[i].fontFamily &&
        c.fontWeight === prev[i].fontWeight &&
        c.fontStyle === prev[i].fontStyle &&
        c.textDecoration === prev[i].textDecoration &&
        c.color === prev[i].color &&
        c.backgroundColor === prev[i].backgroundColor &&
        c.strokeColor === prev[i].strokeColor &&
        c.strokeWidth === prev[i].strokeWidth &&
        c.shadowBlur === prev[i].shadowBlur &&
        c.name === prev[i].name;
      });

    // ★ 핵심: 렌더링 안정성은 유지하되, 내부 clip 객체는 항상 최신으로 갱신
    // (trimStart/startTime/duration이 바뀌어도 re-render는 안 하지만 ref는 업데이트)
    prevVisualClipsRef.current = current;

    // 렌더링에 영향 주는 시각적 속성만 바뀌었을 때 새 배열 반환 (re-render 유발)
    // 같은 URL의 클립 경계 이동은 re-render하지 않음
    return isSameSetForRender ? prev : current;
  }, [visualIndex, displayTime]);

  const prevSubtitleClipsRef = useRef<VideoClip[]>([]);
  const activeSubtitleClips = React.useMemo(() => {
    const bucketIdx = Math.floor(displayTime / BUCKET_SIZE);
    const candidates = subtitleIndex[bucketIdx] || [];
    const allActive = candidates.filter(c => displayTime >= c.startTime && displayTime < c.startTime + c.duration);
    // AI 자막이 있으면 AI만, 없으면 대본만 표시 (상호 배타)
    const aiSub = allActive.find(c => c.trackIndex >= 5 && c.trackIndex <= 8);
    const dialogue = allActive.find(c => c.trackIndex === 0);
    const current: VideoClip[] = [];
    if (aiSub) {
      current.push(aiSub);
    } else if (dialogue) {
      current.push(dialogue);
    }

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
        c.fontFamily === prev[i].fontFamily &&
        c.fontSize === prev[i].fontSize &&
        c.fontWeight === prev[i].fontWeight &&
        c.fontStyle === prev[i].fontStyle &&
        c.textDecoration === prev[i].textDecoration &&
        c.lineHeight === prev[i].lineHeight &&
        c.letterSpacing === prev[i].letterSpacing &&
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


  // ★ 핵심: prevVisualClipsRef.current는 항상 최신 clip 객체를 가지고 있음
  // activeVisualClips는 렌더링 안정성을 위해 stale prev를 반환할 수 있으므로
  // 시간 매핑(startTime/trimStart)이 중요한 activeVideoClip은 반드시 ref에서 가져와야 함
  const activeVideoClipFromTime = prevVisualClipsRef.current.find(c => c.url && !((c.url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || c.name.match(/\.(jpg|jpeg|png|gif|webp|svg)/i))));

  const firstVideoClip = clips.find(c => c.trackIndex === 1 && c.url && !(/\.(jpg|jpeg|png|gif|webp|svg)/i.test(c.url || '') || /\.(jpg|jpeg|png|gif|webp|svg)/i.test(c.name || '')));
  // displayTime 범위 밖이어도 videoRef를 유지하기 위해 firstVideoClip을 fallback으로 사용
  const activeVideoClip = activeVideoClipFromTime || firstVideoClip;
  const selectedVidClip = clips.find(c => selectedClipIds.includes(c.id));

  // Sync video ref
  useEffect(() => {
    videoRefCallback?.(videoRef.current);
  }, [videoRef.current, videoRefCallback]);

  // Direct rAF-based time sync — bypasses React event system entirely
  // Reads video.currentTime directly every frame during playback
  const activeVideoClipRef = useRef(activeVideoClip);
  activeVideoClipRef.current = activeVideoClip;
  const hoverTimeRef = useRef(hoverTime);
  hoverTimeRef.current = hoverTime;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const internalTimeRef = useRef(0);

  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    const tick = () => {
      const video = videoRef.current;
      const clip = activeVideoClipRef.current;

      if (video && clip && !video.paused && hoverTimeRef.current === null) {
        const mediaOffset = clip.trimStart ?? 0;
        const newTime = clip.startTime + (video.currentTime - mediaOffset);
        // Only update state when time actually changed (avoids unnecessary re-renders)
        if (Math.abs(newTime - internalTimeRef.current) > 0.01) {
          internalTimeRef.current = newTime;
          setInternalCurrentTime(newTime);
        }
      }

      if (isPlayingRef.current) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  // External play/pause sync — ONLY responds to isPlaying changes
  // ★ deps에서 activeVideoClip?.id, externalCurrentTime 모두 제거
  //   재생 중 클립 경계를 넘어도 같은 비디오 파일이 이미 재생 중이므로
  //   play() 재호출 불필요 (play() 재호출이 2x 깜빡임의 원인이었음)
  const activeVideoClipRef2 = useRef(activeVideoClip);
  activeVideoClipRef2.current = activeVideoClip;
  const externalCurrentTimeRef = useRef(externalCurrentTime);
  externalCurrentTimeRef.current = externalCurrentTime;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncPlayback = async () => {
      const clip = activeVideoClipRef2.current;
      const extTime = externalCurrentTimeRef.current;
      try {
        if (isPlaying) {
          if (!clip) return;
          // 재생 시작 전 video.currentTime을 올바른 미디어 위치로 설정
          // (분할 클립 경계에서 처음으로 돌아가는 루프 버그 방지)
          if (video.paused && extTime !== undefined) {
            const mediaOffset = clip.trimStart ?? 0;
            const targetMediaTime = (extTime - clip.startTime) + mediaOffset;
            if (Math.abs(video.currentTime - targetMediaTime) > 0.2) {
              video.currentTime = Math.max(0, targetMediaTime);
            }
          }
          if (video.paused) {
            await video.play();
          }
        } else {
          if (!video.paused) video.pause();
        }
      } catch (err) {
        // Play rejected (autoplay policy) — wall-clock fallback will advance time
      }
    };

    syncPlayback();
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync playback rate — only when speed actually changes, not on every clip boundary
  const prevPlaybackRate = useRef(1);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const isVisual = (idx?: number) => idx === 1 || (idx !== undefined && idx >= 10 && idx <= 14);
    const clip = activeVideoClipRef2.current;
    const clipToRate = isVisual(selectedVidClip?.trackIndex) ? selectedVidClip : clip;
    const rate = clipToRate?.speed ?? 1;
    if (rate !== prevPlaybackRate.current) {
      video.playbackRate = rate;
      prevPlaybackRate.current = rate;
    }
  }, [selectedVidClip]);

  // Seed internalCurrentTime from external time when playback starts
  // so displayTime doesn't jump to 0
  useEffect(() => {
    if (isPlaying && externalCurrentTime !== undefined) {
      setInternalCurrentTime(externalCurrentTime);
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // ★ 재생 중에는 seek 하지 않음 — rAF 루프가 video→timeline 동기화를 처리
    // 재생 중 seek하면 클립 경계에서 버벅임 발생 (video가 연속 재생 중인데 강제 seek)
    if (isPlaying) return;

    const mediaOffset = activeVideoClip.trimStart ?? 0;
    const relativeTime = (externalCurrentTime - activeVideoClip.startTime) + mediaOffset;
    const diff = Math.abs(video.currentTime - relativeTime);

    // Q/W trim 감지: trimStart·startTime·duration 중 하나라도 바뀌었으면 강제 seek
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
      // 정지 상태에서 클립 구조 변경 (Q/W trim) → 새 위치로 seek
      if (diff > 0.05) {
        video.currentTime = Math.max(0, relativeTime);
        lastSeekTimeRef.current = Date.now();
      }
      return;
    }

    // Small cooldown after manual seek/hover
    if (Date.now() - lastSeekTimeRef.current < 500) return;

    // 정지 상태: 타이트한 threshold로 정밀 seek
    if (diff > 0.15) {
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
      // 비디오 미디어가 끝나도 타임라인에 더 많은 콘텐츠(자막, 오디오)가 있을 수 있음
      // → page.tsx rAF 루프의 timelineEnd 체크가 재생 종료를 담당하므로, 여기서는
      //   wall-clock fallback이 이어받도록 비디오만 정지 (isPlaying은 건드리지 않음)
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

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/subtitle-preset')) {
      e.preventDefault();
      e.stopPropagation();
      setIsPresetDragOver(true);
      return;
    }
    // 라이브러리 아이템 드래그 (좌측 사이드바에서 프리뷰로)
    if (e.dataTransfer.types.includes('application/library-item') || e.dataTransfer.types.includes('application/library-items')) {
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(true);
      return;
    }
    // 파일 드래그 감지 — dragover 시 브라우저가 type을 빈 문자열로 보낼 수 있으므로
    // kind === 'file'이면 일단 허용 (실제 필터링은 drop 시 수행)
    const hasFile = Array.from(e.dataTransfer.items).some(
      item => item.kind === 'file' && (item.type === '' || ACCEPTED_FILE_TYPES.some(t => item.type.startsWith(t)))
    );
    if (hasFile || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(true);
    }
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    // main 영역 밖으로 나갈 때만 상태 리셋 (자식 요소 간 이동 시 깜빡임 방지)
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom) {
      setIsPresetDragOver(false);
      setIsFileDragOver(false);
    }
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

    // 라이브러리 아이템 드롭 (좌측 사이드바에서 프리뷰로)
    const libraryItemsData = e.dataTransfer.getData('application/library-items');
    if (libraryItemsData && onLibraryItemDrop) {
      try {
        const items: { id: string }[] = JSON.parse(libraryItemsData);
        for (const item of items) onLibraryItemDrop(item.id);
      } catch { }
      return;
    }
    const libraryData = e.dataTransfer.getData('application/library-item');
    if (libraryData && onLibraryItemDrop) {
      try {
        const item = JSON.parse(libraryData);
        onLibraryItemDrop(item.id);
      } catch { }
      return;
    }

    // 파일 드롭 — MIME 타입 또는 확장자로 필터링
    if (onFileDrop && e.dataTransfer.files.length > 0) {
      const MEDIA_EXTS = /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv|mp3|wav|aac|m4a|ogg|flac|wma|jpg|jpeg|png|gif|webp|bmp|svg|heic)$/i;
      const files = Array.from(e.dataTransfer.files).filter(f =>
        ACCEPTED_FILE_TYPES.some(t => f.type.startsWith(t)) || MEDIA_EXTS.test(f.name)
      );
      if (files.length > 0) onFileDrop(files);
    }
  }, [onPresetDrop, onFileDrop, onLibraryItemDrop]);

  const handleClipContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clipIds: [clipId] });
  }, []);

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>, clipId: string) => {
    if (clipId === activeVideoClip?.id && hoverTime === null) {
      const mediaOffset = activeVideoClip.trimStart ?? 0;
      const time = activeVideoClip.startTime + (e.currentTarget.currentTime - mediaOffset);
      // Always update internal time for subtitle display (no throttle — native onTimeUpdate is ~4Hz)
      setInternalCurrentTime(time);
      // Throttle parent callback to avoid expensive page re-renders
      const now = Date.now();
      if (now - lastUpdateRef.current > 50) {
        onTimeUpdate?.(time);
        lastUpdateRef.current = now;
      }
    }
  };

  return (
    <main
      className="flex-1 flex flex-col bg-black relative min-h-0 min-w-0 h-full w-full"
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
    >
      <div className="flex-1 flex items-center justify-center p-2 bg-editor-bg overflow-hidden min-h-0 min-w-0 relative" ref={viewerAreaRef} onClick={handleCanvasClick}>
        {/* 자막 타입 범례 (Legend) — 프리뷰 바깥 상단 */}
        <div className="absolute top-2 right-3 z-10 flex items-center gap-2.5 bg-editor-bg/80 backdrop-blur-sm rounded px-2.5 py-1 border border-border-color/30">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#FFFFFF' }} />
            <span className="text-[9px] text-gray-400">대본</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#FFE066' }} />
            <span className="text-[9px] text-gray-400">예능</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#A8E6CF' }} />
            <span className="text-[9px] text-gray-400">상황</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#88D8FF' }} />
            <span className="text-[9px] text-gray-400">설명</span>
          </div>
        </div>
        <div
          ref={containerRef}
          className={`bg-black shadow-2xl relative group overflow-visible transition-all duration-200 ${isPresetDragOver ? 'border-2 border-[#00D4D4] border-dashed shadow-lg shadow-[#00D4D4]/30'
            : isFileDragOver ? 'border-2 border-blue-400 border-dashed shadow-lg shadow-blue-400/30'
            : 'border border-border-color/30'
            }`}
          onClick={(e) => handleVideoClick(e)}
          onContextMenu={handleContextMenu}
          style={{
            transformOrigin: 'center center',
            ...canvasSize,
            backgroundColor: '#000',
            position: 'relative',
          }}
        >
          <div className="absolute inset-0 overflow-hidden" style={{ transform: `scale(${viewerZoom / 100})` }}>
            {/* 비디오 클립이 타임라인에 있으면 항상 렌더 (displayTime 범위 밖이어도 videoRef 유지) */}
            {(activeVisualClips.length > 0 || firstVideoClip) ? (
              <VisualLayer
                activeVisualClips={activeVisualClips.length > 0 ? activeVisualClips : (firstVideoClip ? [firstVideoClip] : [])}
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
            activeSafeZones={activeSafeZones}
            guideLinesH={guideLinesH}
            guideLinesV={guideLinesV}
            containerRef={containerRef}
          />

          {/* Safe Zone Overlay */}
          {(canvasAspectRatio === '9:16' || canvasAspectRatio === '3:4') && activeSafeZones.size > 0 && (
            <SafeZoneOverlay activePlatforms={activeSafeZones} />
          )}

          {/* 가로 가이드 라인들 — 무한대 개수, 화면 밖으로 드래그하면 삭제 */}
          {guideLinesH.map((gl) => (
            <div
              key={`gh-${gl.id}`}
              className="absolute left-0 right-0 z-[140]"
              style={{ top: `calc(${gl.pct}% - 10px)`, height: 20, cursor: 'ns-resize', pointerEvents: 'auto' }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                _guideDragActive = true;
                setIsDraggingGuide(true);
                const container = containerRef.current;
                if (!container) return;
                const lineId = gl.id;
                const onMove = (ev: PointerEvent) => {
                  const rect = container.getBoundingClientRect();
                  const y = ev.clientY;
                  if (y < rect.top - 30 || y > rect.bottom + 30) {
                    setGuideLinesH(prev => prev.filter(g => g.id !== lineId));
                  } else {
                    const p = Math.max(2, Math.min(98, ((y - rect.top) / rect.height) * 100));
                    setGuideLinesH(prev => prev.map(g => g.id === lineId ? { ...g, pct: p } : g));
                  }
                };
                const onUp = () => {
                  _guideDragActive = false;
                  setIsDraggingGuide(false);
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  window.removeEventListener('pointercancel', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
              }}
            >
              <div className="absolute left-0 right-0" style={{ top: 9, height: 2, borderTop: '2px dashed #FF6B6B', opacity: 0.9 }} />
              <div className="absolute left-1 px-1.5 py-0.5 rounded text-[8px] font-bold pointer-events-none"
                style={{ top: -6, background: 'rgba(255,107,107,0.9)', color: '#fff' }}>
                {Math.round(gl.pct)}%
              </div>
            </div>
          ))}

          {/* 세로 가이드 라인들 — 무한대 개수, 화면 밖으로 드래그하면 삭제 */}
          {guideLinesV.map((gl) => (
            <div
              key={`gv-${gl.id}`}
              className="absolute top-0 bottom-0 z-[140]"
              style={{ left: `calc(${gl.pct}% - 10px)`, width: 20, cursor: 'ew-resize', pointerEvents: 'auto' }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                _guideDragActive = true;
                setIsDraggingGuide(true);
                const container = containerRef.current;
                if (!container) return;
                const lineId = gl.id;
                const onMove = (ev: PointerEvent) => {
                  const rect = container.getBoundingClientRect();
                  const x = ev.clientX;
                  if (x < rect.left - 30 || x > rect.right + 30) {
                    setGuideLinesV(prev => prev.filter(g => g.id !== lineId));
                  } else {
                    const p = Math.max(2, Math.min(98, ((x - rect.left) / rect.width) * 100));
                    setGuideLinesV(prev => prev.map(g => g.id === lineId ? { ...g, pct: p } : g));
                  }
                };
                const onUp = () => {
                  _guideDragActive = false;
                  setIsDraggingGuide(false);
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  window.removeEventListener('pointercancel', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
              }}
            >
              <div className="absolute top-0 bottom-0" style={{ left: 9, width: 2, borderLeft: '2px dashed #4DA6FF', opacity: 0.9 }} />
              <div className="absolute top-1 px-1.5 py-0.5 rounded text-[8px] font-bold pointer-events-none"
                style={{ left: 18, background: 'rgba(77,166,255,0.9)', color: '#fff', whiteSpace: 'nowrap' }}>
                {Math.round(gl.pct)}%
              </div>
            </div>
          ))}

          {/* 가이드라인 생성 영역 — 기존 라인(z-140) 아래에 배치하여 라인 드래그 우선 */}
          {guideLineMode && (
            <div
              className="absolute inset-0 z-[135]"
              style={{ pointerEvents: 'auto', cursor: guideLineMode === 'h' ? 'row-resize' : 'col-resize' }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const container = containerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                // 클릭 위치에 라인 생성
                const newId = ++_guideIdCounter;
                if (guideLineMode === 'h') {
                  const p = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
                  setGuideLinesH(prev => [...prev, { id: newId, pct: p }]);
                  // 생성 직후 바로 드래그 시작
                  _guideDragActive = true;
                  setIsDraggingGuide(true);
                  const onMove = (ev: PointerEvent) => {
                    const r = container.getBoundingClientRect();
                    const y = ev.clientY;
                    if (y < r.top - 30 || y > r.bottom + 30) {
                      setGuideLinesH(prev => prev.filter(g => g.id !== newId));
                    } else {
                      const np = Math.max(2, Math.min(98, ((y - r.top) / r.height) * 100));
                      setGuideLinesH(prev => prev.map(g => g.id === newId ? { ...g, pct: np } : g));
                    }
                  };
                  const onUp = () => {
                    _guideDragActive = false;
                    setIsDraggingGuide(false);
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                } else {
                  const p = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
                  setGuideLinesV(prev => [...prev, { id: newId, pct: p }]);
                  _guideDragActive = true;
                  setIsDraggingGuide(true);
                  const onMove = (ev: PointerEvent) => {
                    const r = container.getBoundingClientRect();
                    const x = ev.clientX;
                    if (x < r.left - 30 || x > r.right + 30) {
                      setGuideLinesV(prev => prev.filter(g => g.id !== newId));
                    } else {
                      const np = Math.max(2, Math.min(98, ((x - r.left) / r.width) * 100));
                      setGuideLinesV(prev => prev.map(g => g.id === newId ? { ...g, pct: np } : g));
                    }
                  };
                  const onUp = () => {
                    _guideDragActive = false;
                    setIsDraggingGuide(false);
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Escape') setGuideLineMode(null); }}
              tabIndex={0}
            >
              <div className="absolute inset-0 pointer-events-none bg-black/10" />
            </div>
          )}

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
          items={[
            { label: '삭제', icon: 'delete', shortcut: 'Del', danger: true, action: () => {
              if (contextMenu?.clipIds?.[0] && onClipDelete) {
                onClipDelete(contextMenu.clipIds[0]);
                onClipSelect?.([]);
              }
            }},
          ]}
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
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-mono font-semibold transition-colors duration-100 ${
              isDraggingPlayhead
                ? 'text-orange-400'
                : isPlaying
                  ? 'text-white'
                  : 'text-[#4488FF]'
            }`}>{formatTime(currentTime)}</span>
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
          {/* 가이드 라인 — H/V 누르면 그리기 모드, 화면 클릭→생성, 바로 드래그→이동, 화면 밖→삭제 */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setGuideLineMode('h')}
              className={`flex items-center gap-0.5 transition-all px-1 py-0.5 rounded ${guideLineMode === 'h' ? 'text-[#FF6B6B] bg-[#FF6B6B]/20 ring-1 ring-[#FF6B6B]' : guideLinesH.length > 0 ? 'text-[#FF6B6B] bg-[#FF6B6B]/10' : 'text-gray-400 hover:text-white'}`}
              title="가로 가이드 그리기"
            >
              <span className="material-icons text-xs">horizontal_rule</span>
              <span className="text-[8px] font-bold">H{guideLinesH.length > 0 ? `(${guideLinesH.length})` : ''}</span>
            </button>
            <button
              onClick={() => setGuideLineMode('v')}
              className={`flex items-center gap-0.5 transition-all px-1 py-0.5 rounded ${guideLineMode === 'v' ? 'text-[#4DA6FF] bg-[#4DA6FF]/20 ring-1 ring-[#4DA6FF]' : guideLinesV.length > 0 ? 'text-[#4DA6FF] bg-[#4DA6FF]/10' : 'text-gray-400 hover:text-white'}`}
              title="세로 가이드 그리기"
            >
              <span className="material-icons text-xs" style={{ transform: 'rotate(90deg)' }}>horizontal_rule</span>
              <span className="text-[8px] font-bold">V{guideLinesV.length > 0 ? `(${guideLinesV.length})` : ''}</span>
            </button>
            {(guideLinesH.length > 0 || guideLinesV.length > 0) && (
              <button
                onClick={() => { setGuideLinesH([]); setGuideLinesV([]); setGuideLineMode(null); }}
                className="flex items-center gap-0.5 transition-all px-1 py-0.5 rounded text-gray-400 hover:text-red-400"
                title="모든 가이드 라인 삭제"
              >
                <span className="material-icons text-xs">delete_outline</span>
              </button>
            )}
          </div>
          <div className="w-px h-3 bg-gray-700" />
          {/* Safe Zone Toggle — SNS 미리보기 */}
          {(canvasAspectRatio === '9:16' || canvasAspectRatio === '3:4') && (
            <div className="relative">
              <button
                onClick={() => setShowSafeZoneMenu(prev => !prev)}
                className={`flex items-center gap-0.5 transition-all ${activeSafeZones.size > 0 ? 'text-[#00D4D4]' : 'text-gray-400 hover:text-white'}`}
                title="세이프존 가이드"
              >
                <span className="material-icons text-sm">grid_on</span>
                <span className="text-[9px] font-medium">Safe</span>
              </button>
              {showSafeZoneMenu && (
                <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 w-40">
                  <div className="px-3 py-1 text-[10px] text-gray-500 font-semibold">세이프존 가이드</div>
                  {(Object.entries(SAFE_ZONE_CONFIG) as [SafeZonePlatform, typeof SAFE_ZONE_CONFIG[SafeZonePlatform]][]).map(([platform, cfg]) => {
                    const isActive = activeSafeZones.has(platform);
                    return (
                      <button
                        key={platform}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center justify-between"
                        onClick={() => {
                          setActiveSafeZones(prev => {
                            const next = new Set(prev);
                            if (next.has(platform)) next.delete(platform);
                            else next.add(platform);
                            return next;
                          });
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[8px] font-black"
                            style={{ background: cfg.color, color: '#fff' }}
                          >
                            {cfg.icon}
                          </span>
                          <span style={{ color: isActive ? cfg.color : '#fff' }}>{cfg.label}</span>
                        </div>
                        {isActive && <span className="material-icons text-xs" style={{ color: cfg.color }}>check</span>}
                      </button>
                    );
                  })}
                  <div className="border-t border-gray-700 mt-1 pt-1">
                    <button
                      className="w-full text-left px-3 py-1 text-[10px] text-gray-500 hover:text-white"
                      onClick={() => setActiveSafeZones(new Set())}
                    >
                      전체 해제
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
