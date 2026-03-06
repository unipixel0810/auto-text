'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ContextMenu from '@/components/ui/ContextMenu';
import type { VideoClip } from '@/types/video';
import type { SubtitlePreset } from '@/lib/subtitlePresets';

interface PlayerProps {
  videoUrl?: string;
  currentTime?: number;
  hoverTime?: number | null;
  selectedClipId?: string | null;
  clips?: VideoClip[];
  isPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onTimeUpdate?: (time: number) => void;
  onSeek?: (time: number) => void;
  onClipSelect?: (clipId: string | null) => void;
  onClipDelete?: (clipId: string) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  videoRefCallback?: (ref: HTMLVideoElement | null) => void;
  onPresetDrop?: (preset: SubtitlePreset, x: number, y: number) => void;
  viewerZoom?: number;
  onViewerZoomChange?: (zoom: number) => void;
  playbackQuality?: 'auto' | 'high' | 'medium' | 'low';
  onPlaybackQualityChange?: (q: 'auto' | 'high' | 'medium' | 'low') => void;
}

export default function Player({
  videoUrl,
  currentTime: externalCurrentTime,
  hoverTime,
  selectedClipId,
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
  viewerZoom = 100,
  onViewerZoomChange,
  playbackQuality = 'auto',
  onPlaybackQualityChange,
}: PlayerProps) {
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [isDragging, setIsDragging] = useState<'move' | 'scale' | 'rotate' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const currentTime = externalCurrentTime !== undefined ? externalCurrentTime : internalCurrentTime;
  const displayTime = hoverTime !== null && hoverTime !== undefined ? hoverTime : currentTime;

  // Visual clips: track 1 (Main), tracks 10-14 (Overlays), track 0 (Subtitles)
  const activeVisualClips = clips
    .filter(c => (c.trackIndex === 1 || (c.trackIndex >= 10 && c.trackIndex <= 14) || c.trackIndex === 0) && displayTime >= c.startTime && displayTime < c.startTime + c.duration)
    .sort((a, b) => {
      // Define rendering order (z-index)
      // Main Video (1) is bottom
      // Overlays (10-14) are middle (higher index = higher layer)
      // Subtitles (0) are top
      if (a.trackIndex === 0) return 1;
      if (b.trackIndex === 0) return -1;
      if (a.trackIndex === 1) return -1;
      if (b.trackIndex === 1) return 1;
      return a.trackIndex - b.trackIndex;
    });

  const activeVideoClip = activeVisualClips.find(c => !((c.url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || c.name.match(/\.(jpg|jpeg|png|gif|webp|svg)/i))));

  const firstVideoClip = clips.find(c => c.trackIndex === 1);
  const selectedVidClip = clips.find(c => c.id === selectedClipId);
  const isSelected = selectedClipId != null && (activeVisualClips.some(c => c.id === selectedClipId) || firstVideoClip?.id === selectedClipId);

  // Sync video ref
  useEffect(() => {
    videoRefCallback?.(videoRef.current);
  }, [videoRef.current, videoRefCallback]);

  // External play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) { video.play().catch(() => { }); }
    else { video.pause(); }
  }, [isPlaying]);

  // Sync playback rate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const isVisual = (idx?: number) => idx === 1 || (idx !== undefined && idx >= 10 && idx <= 14);
    const clipToRate = isVisual(selectedVidClip?.trackIndex) ? selectedVidClip : activeVideoClip;
    video.playbackRate = clipToRate?.speed ?? 1;
  }, [activeVideoClip, selectedVidClip]);

  // External time sync - lowered threshold for smooth scrubbing
  useEffect(() => {
    if (videoRef.current && externalCurrentTime !== undefined && activeVideoClip && hoverTime === null) {
      const relativeTime = externalCurrentTime - activeVideoClip.startTime;
      const diff = Math.abs(videoRef.current.currentTime - relativeTime);
      if (diff > 0.05) videoRef.current.currentTime = relativeTime;
    }
  }, [externalCurrentTime, activeVideoClip, hoverTime]);

  // Sync for hover preview
  useEffect(() => {
    if (videoRef.current && hoverTime != null && activeVideoClip) {
      const relativeTime = hoverTime - activeVideoClip.startTime;
      videoRef.current.currentTime = relativeTime;
    }
  }, [hoverTime, activeVideoClip]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && activeVideoClip) {
      const h = () => setTotalTime(video.duration);
      video.addEventListener('loadedmetadata', h);
      return () => video.removeEventListener('loadedmetadata', h);
    }
  }, [activeVideoClip]);

  const handlePlayPause = () => {
    onPlayingChange?.(!isPlaying);
  };

  const handleVideoClick = (e: React.MouseEvent, clipId?: string) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('[data-handle]')) return;
    if (clipId) onClipSelect?.(clipId);
    else if (activeVisualClips.length > 0) onClipSelect?.(activeVisualClips[activeVisualClips.length - 1].id);
    else if (firstVideoClip) onClipSelect?.(firstVideoClip.id);
    else onClipSelect?.(null);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Click on empty canvas area → deselect
    if (e.target === e.currentTarget) onClipSelect?.(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedVidClip) setContextMenu({ x: e.clientX, y: e.clientY, clipId: selectedVidClip.id });
    else if (activeVisualClips.length > 0) setContextMenu({ x: e.clientX, y: e.clientY, clipId: activeVisualClips[activeVisualClips.length - 1].id });
    else if (firstVideoClip) setContextMenu({ x: e.clientX, y: e.clientY, clipId: firstVideoClip.id });
  };

  const handleDoubleClick = (_e: React.MouseEvent) => {
    // placeholder for future double-click actions
  };

  // Handle preset swatch drop on canvas
  const [isPresetDragOver, setIsPresetDragOver] = useState(false);
  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/subtitle-preset')) {
      e.preventDefault();
      e.stopPropagation();
      setIsPresetDragOver(true);
    }
  }, []);
  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsPresetDragOver(false);
  }, []);
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsPresetDragOver(false);
    const presetData = e.dataTransfer.getData('application/subtitle-preset');
    if (presetData && onPresetDrop) {
      try {
        const preset = JSON.parse(presetData);
        const rect = containerRef.current?.getBoundingClientRect();
        const x = rect ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
        const y = rect ? ((e.clientY - rect.top) / rect.height) * 100 : 50;
        onPresetDrop(preset, x, y);
      } catch { }
    }
  }, [onPresetDrop]);

  // ===== Transform handles drag =====
  const handleTransformStart = useCallback((e: React.MouseEvent, type: 'move' | 'scale' | 'rotate') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(type);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!isDragging || !selectedVidClip || !onClipUpdate) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (isDragging === 'move') {
        onClipUpdate(selectedVidClip.id, {
          positionX: (selectedVidClip.positionX ?? 0) + dx,
          positionY: (selectedVidClip.positionY ?? 0) + dy,
        });
      } else if (isDragging === 'scale') {
        const delta = (dx + dy) / 2;
        const newScale = Math.max(10, Math.min(300, (selectedVidClip.scale ?? 100) + delta));
        onClipUpdate(selectedVidClip.id, { scale: Math.round(newScale) });
      } else if (isDragging === 'rotate') {
        const newRot = Math.max(-180, Math.min(180, (selectedVidClip.rotation ?? 0) + dx));
        onClipUpdate(selectedVidClip.id, { rotation: Math.round(newRot) });
      }
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    const handleMouseUp = () => setIsDragging(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, selectedVidClip, onClipUpdate]);

  return (
    <main className="flex-1 flex flex-col bg-black relative">
      <div className="flex-1 flex items-center justify-center p-8 bg-editor-bg overflow-hidden" onClick={handleCanvasClick}>
        <div
          ref={containerRef}
          className={`aspect-video w-full max-w-3xl bg-black shadow-2xl relative group overflow-visible border-2 transition-all duration-200 ${isPresetDragOver ? 'border-[#00D4D4] border-dashed shadow-lg shadow-[#00D4D4]/30'
            : isSelected ? 'border-primary shadow-lg shadow-primary/30' : 'border-border-color hover:border-gray-500'
            }`}
          onClick={(e) => handleVideoClick(e)}
          onContextMenu={handleContextMenu}
          onDoubleClick={handleDoubleClick}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
          style={{
            transformOrigin: 'center center',
          }}
        >
          <div className="w-full h-full relative overflow-hidden" style={{ transform: `scale(${viewerZoom / 100})` }}>
            {activeVisualClips.length > 0 ? (
              activeVisualClips.map((clip) => {
                const isImage = (clip.url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || clip.name.match(/\.(jpg|jpeg|png|gif|webp|svg)/i));
                const isClipSelected = selectedClipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    className={`absolute inset-0 pointer-events-auto ${isClipSelected ? 'z-50' : ''}`}
                    style={{
                      transform: `translate(${clip.positionX ?? 0}px, ${clip.positionY ?? 0}px) rotate(${clip.rotation ?? 0}deg) scale(${(clip.scale ?? 100) / 100})`,
                      zIndex: clip.trackIndex === 0 ? 100 : (clip.trackIndex >= 10 ? clip.trackIndex : 1)
                    }}
                    onClick={(e) => handleVideoClick(e, clip.id)}
                  >
                    {!isImage ? (
                      <video
                        ref={clip.id === activeVideoClip?.id ? videoRef : null}
                        src={clip.url}
                        className="w-full h-full object-contain"
                        preload="auto"
                        playsInline
                        muted={clip.id !== activeVideoClip?.id} // Only one audio source
                        onTimeUpdate={(e) => {
                          if (clip.id === activeVideoClip?.id && hoverTime === null) {
                            const time = clip.startTime + e.currentTarget.currentTime;
                            setInternalCurrentTime(time);
                            onTimeUpdate?.(time);
                          }
                        }}
                        onPlay={() => { if (clip.id === activeVideoClip?.id) onPlayingChange?.(true); }}
                        onPause={() => { if (clip.id === activeVideoClip?.id) onPlayingChange?.(false); }}
                      />
                    ) : (
                      <img
                        src={clip.url}
                        alt={clip.name}
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    )}
                  </div>
                );
              })
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center bg-gray-900 gap-3 cursor-pointer hover:bg-gray-800 transition-colors"
                onDoubleClick={handleDoubleClick}
              >
                <span className="material-icons text-gray-600 text-6xl">play_circle_outline</span>
                <span className="text-gray-500 text-sm font-medium">더블클릭 또는 파일을 드래그하여 추가</span>
                <span className="text-gray-600 text-xs">동영상, 사진, 오디오, 자막 파일 지원</span>
              </div>
            )}
          </div>

          {/* Text clip overlays on canvas */}
          {clips.filter(c => c.trackIndex === 0 && displayTime >= c.startTime && displayTime < c.startTime + c.duration).map(clip => (
            <div
              key={clip.id}
              className={`absolute left-1/2 -translate-x-1/2 bottom-[12%] px-3 py-1.5 rounded cursor-pointer z-10 max-w-[80%] text-center transition-all ${selectedClipId === clip.id ? 'ring-2 ring-primary' : ''
                }`}
              style={{
                transform: `translate(${clip.positionX ?? 0}px, ${clip.positionY ?? 0}px) translateX(-50%)`,
                left: '50%',
              }}
              onClick={(e) => { e.stopPropagation(); onClipSelect?.(clip.id); }}
            >
              <span className="text-lg font-bold text-white drop-shadow-lg">{clip.name}</span>
            </div>
          ))}

          {/* Preset drag hint overlay */}
          {isPresetDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-30">
              <span className="text-white text-sm font-medium bg-[#00D4D4]/20 px-4 py-2 rounded-lg border border-[#00D4D4]/50">
                여기에 놓아 텍스트 추가
              </span>
            </div>
          )}

          {/* Hover play overlay */}
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

          {/* ===== BOUNDING BOX WITH 8 HANDLES ===== */}
          {isSelected && (
            <>
              {/* Border */}
              <div className="absolute -inset-px border-2 border-primary pointer-events-none z-10" />

              {/* Move handle (center) */}
              <div
                data-handle="move"
                className="absolute inset-0 cursor-move z-10"
                onMouseDown={(e) => handleTransformStart(e, 'move')}
              />

              {/* Corner handles (scale) */}
              {[
                { pos: '-top-1.5 -left-1.5', cursor: 'nwse-resize' },
                { pos: '-top-1.5 -right-1.5', cursor: 'nesw-resize' },
                { pos: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
                { pos: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
              ].map((h, i) => (
                <div
                  key={i}
                  data-handle="scale"
                  className={`absolute ${h.pos} w-3 h-3 bg-white border-2 border-primary rounded-sm z-20`}
                  style={{ cursor: h.cursor }}
                  onMouseDown={(e) => handleTransformStart(e, 'scale')}
                />
              ))}

              {/* Edge handles (scale) */}
              {[
                { pos: '-top-1.5 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
                { pos: '-bottom-1.5 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
                { pos: 'top-1/2 -left-1.5 -translate-y-1/2', cursor: 'ew-resize' },
                { pos: 'top-1/2 -right-1.5 -translate-y-1/2', cursor: 'ew-resize' },
              ].map((h, i) => (
                <div
                  key={i + 4}
                  data-handle="scale"
                  className={`absolute ${h.pos} w-2.5 h-2.5 bg-white border-2 border-primary rounded-sm z-20`}
                  style={{ cursor: h.cursor }}
                  onMouseDown={(e) => handleTransformStart(e, 'scale')}
                />
              ))}

              {/* Rotate handle (top center, above) */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
                <div
                  data-handle="rotate"
                  className="w-4 h-4 rounded-full bg-primary border-2 border-white cursor-grab active:cursor-grabbing shadow-lg"
                  onMouseDown={(e) => handleTransformStart(e, 'rotate')}
                />
                <div className="w-px h-4 bg-primary" />
              </div>

              {/* Label */}
              <div className="absolute -top-6 left-0 bg-primary text-white text-[9px] px-1.5 py-0.5 rounded pointer-events-none z-20">
                {selectedVidClip?.name || '선택됨'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => { if (contextMenu.clipId) onClipDelete?.(contextMenu.clipId); setContextMenu(null); }}
        />
      )}

      {/* Player Controls Bar */}
      <div className="h-10 bg-editor-bg border-t border-border-color flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center space-x-2 w-1/3">
          <span className="text-xs font-mono text-primary">{formatTime(currentTime)}</span>
          <span className="text-xs font-mono text-text-secondary">/ {formatTime(totalTime)}</span>
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
          {/* Viewer Zoom */}
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
          {/* Quality Selector */}
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
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}
