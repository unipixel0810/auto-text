'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from '@/components/layout/Header';
import SecondaryToolbar from '@/components/layout/SecondaryToolbar';
import LeftSidebar from '@/components/layout/LeftSidebar';
import Player from '@/components/layout/Player';
import RightSidebar from '@/components/layout/RightSidebar';
import Timeline from '@/components/layout/Timeline';
import { parseSubtitleFile } from '@/lib/subtitleParser';
import type { TranscriptItem, SubtitleItem } from '@/types/subtitle';
import type { VideoClip, HistoryEntry, ClipboardData } from '@/types/video';
import type { SubtitlePreset } from '@/lib/subtitlePresets';

const FRAME_DURATION = 1 / 30;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;

export default function Home() {
  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'stickers' | 'effects' | 'transitions'>('media');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | undefined>();
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);
  const clipIdCounter = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<HistoryEntry[]>([{ clips: [], selectedClipId: null }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const skipHistoryRef = useRef(false);

  // Clipboard
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Active file info for header
  const [activeFileName, setActiveFileName] = useState<string | undefined>();
  const [activeFileDuration, setActiveFileDuration] = useState<number | undefined>();

  const selectedClip = clips.find(c => c.id === selectedClipId) || null;

  // ===== REFS for stable access inside document-level keydown =====
  const clipsRef = useRef(clips);
  const selectedClipIdRef = useRef(selectedClipId);
  const currentTimeRef = useRef(currentTime);
  const clipboardRef = useRef(clipboard);
  const isPlayingRef = useRef(isPlaying);
  const isTimelineHoveredRef = useRef(isTimelineHovered);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { selectedClipIdRef.current = selectedClipId; }, [selectedClipId]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isTimelineHoveredRef.current = isTimelineHovered; }, [isTimelineHovered]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // Push to history
  const pushHistory = useCallback((newClips: VideoClip[], newSelectedId: string | null) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndexRef.current + 1);
      return [...trimmed, { clips: newClips, selectedClipId: newSelectedId }];
    });
    setHistoryIndex(prev => prev + 1);
  }, []);

  // Track clips changes for history
  useEffect(() => {
    pushHistory(clips, selectedClipId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // Generate unique clip ID
  const genId = () => `clip_${Date.now()}_${clipIdCounter.current++}`;

  // ===== Undo =====
  const handleUndo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx <= 0) return;
    const newIndex = idx - 1;
    const entry = hist[newIndex];
    skipHistoryRef.current = true;
    setClips(entry.clips);
    setSelectedClipId(entry.selectedClipId);
    setHistoryIndex(newIndex);
  }, []);

  // ===== Redo =====
  const handleRedo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx >= hist.length - 1) return;
    const newIndex = idx + 1;
    const entry = hist[newIndex];
    skipHistoryRef.current = true;
    setClips(entry.clips);
    setSelectedClipId(entry.selectedClipId);
    setHistoryIndex(newIndex);
  }, []);

  // Video add handler
  const handleVideoAdd = useCallback((file: File) => {
    const clipId = genId();
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const trackIndex = file.type.startsWith('video/') ? 1 : file.type.startsWith('audio/') ? 2 : 0;
      setClips(prev => {
        const sameTrackClips = prev.filter(c => c.trackIndex === trackIndex);
        const startTime = sameTrackClips.length > 0 ? Math.max(...sameTrackClips.map(c => c.startTime + c.duration)) : 0;
        return [...prev, {
          id: clipId, name: file.name, url, startTime, duration: duration || 10, originalDuration: duration || 10,
          trackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
        }];
      });
      setSelectedClipId(clipId);
      if (file.type.startsWith('video/')) {
        setCurrentVideoUrl(url);
        setCurrentVideoFile(file);
        setActiveFileName(file.name);
        setActiveFileDuration(duration);
      }
    };
    video.onerror = () => {
      const trackIndex = file.type.startsWith('image/') ? 1 : 0;
      setClips(prev => [...prev, {
        id: clipId, name: file.name, url, startTime: 0, duration: 10, originalDuration: 10,
        trackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
      }]);
    };
  }, []);

  const handleClipAdd = useCallback((file: File, trackIndex: number, startTime: number) => {
    const clipId = genId();
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    video.onloadedmetadata = () => {
      const dur = video.duration || 10;
      setClips(prev => [...prev, {
        id: clipId, name: file.name, url, startTime, duration: dur, originalDuration: dur,
        trackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
      }]);
      if (file.type.startsWith('video/') && !currentVideoUrl) {
        setCurrentVideoUrl(url);
        setActiveFileName(file.name);
        setActiveFileDuration(video.duration);
      }
    };
    video.onerror = () => {
      setClips(prev => [...prev, {
        id: clipId, name: file.name, url, startTime, duration: 10, originalDuration: 10,
        trackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
      }]);
    };
  }, [currentVideoUrl]);

  const handleClipUpdate = useCallback((clipId: string, updates: Partial<VideoClip>) => {
    setClips(prev => prev.map(clip => clip.id === clipId ? { ...clip, ...updates } : clip));
  }, []);

  const handlePlayheadChange = useCallback((position: number) => setCurrentTime(position), []);
  const handleSeek = useCallback((time: number) => setCurrentTime(time), []);
  const handleClipSelect = useCallback((clipId: string | null) => {
    setSelectedClipId(clipId);
    if (clipId) {
      const clip = clipsRef.current.find(c => c.id === clipId);
      if (clip) {
        setActiveFileName(clip.name);
        setActiveFileDuration(clip.originalDuration ?? clip.duration);
      }
    }
  }, []);

  const handleClipDelete = useCallback((clipId: string) => {
    setClips(prev => {
      const updated = prev.filter(c => c.id !== clipId);
      const deleted = prev.find(c => c.id === clipId);
      if (deleted && deleted.url === currentVideoUrl) {
        const next = updated.find(c => c.trackIndex === 1 && c.url);
        setCurrentVideoUrl(next?.url);
      }
      return updated;
    });
    setSelectedClipId(null);
  }, [currentVideoUrl]);

  // ===== Speed change — adjusts clip duration =====
  const handleSpeedChange = useCallback((clipId: string, speed: number) => {
    setClips(prev => prev.map(clip => {
      if (clip.id !== clipId) return clip;
      const origDur = clip.originalDuration ?? clip.duration;
      const newDuration = origDur / speed;
      return { ...clip, speed, originalDuration: origDur, duration: newDuration };
    }));
    // Also update video playback rate
    if (videoRef.current) {
      const clip = clipsRef.current.find(c => c.id === clipId);
      if (clip && clip.trackIndex === 1) {
        videoRef.current.playbackRate = speed;
      }
    }
  }, []);

  // Rename from header
  const handleRename = useCallback((newName: string) => {
    setActiveFileName(newName);
    const selId = selectedClipIdRef.current;
    if (selId) handleClipUpdate(selId, { name: newName });
  }, [handleClipUpdate]);

  // Add subtitle clips to timeline from parsed SRT/ASS
  const handleAddSubtitleClips = useCallback((items: TranscriptItem[]) => {
    const newClips: VideoClip[] = items.map((item) => ({
      id: genId(),
      name: item.editedText || item.originalText,
      url: '',
      startTime: item.startTime,
      duration: item.endTime - item.startTime,
      trackIndex: 0,
      scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: false,
    }));
    setClips(prev => [...prev, ...newClips]);
  }, []);

  // Handle SRT/ASS file import
  const handleSubtitleImport = useCallback(async (file: File) => {
    try {
      const parsed = await parseSubtitleFile(file);
      setTranscripts(prev => [...prev, ...parsed]);
      const newClips: VideoClip[] = parsed.map((item) => ({
        id: genId(),
        name: item.editedText || item.originalText,
        url: '',
        startTime: item.startTime,
        duration: item.endTime - item.startTime,
        trackIndex: 0,
        scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: false,
      }));
      setClips(prev => [...prev, ...newClips]);
      setActiveFileName(file.name);
    } catch (err: any) {
      alert(`자막 파일 파싱 실패: ${err.message}`);
    }
  }, []);

  // Fit timeline to screen
  const handleFitToScreen = useCallback(() => {
    const allClips = clipsRef.current;
    const totalDuration = allClips.length > 0 ? Math.max(...allClips.map(c => c.startTime + c.duration)) : 60;
    const timelineEl = document.querySelector('footer');
    const width = timelineEl ? timelineEl.clientWidth - 96 : 800;
    const fitZoom = width / (totalDuration * 50);
    setTimelineZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom)));
  }, []);

  // ===== DEFINITIVE GLOBAL KEYBOARD SHORTCUTS =====
  // Uses refs to avoid stale closures — the handler never needs to be re-registered
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (document.activeElement as HTMLElement)?.isContentEditable;

      const cmd = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;

      // --- TIMELINE ZOOM (always, Cmd+= / Cmd+- / Cmd+Shift+F) ---
      if (cmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setTimelineZoom(prev => Math.min(MAX_ZOOM, prev * ZOOM_STEP));
        return;
      }
      if (cmd && e.key === '-' && !shift) {
        e.preventDefault();
        setTimelineZoom(prev => Math.max(MIN_ZOOM, prev / ZOOM_STEP));
        return;
      }
      if (cmd && shift && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // --- UNDO / REDO (always, even in inputs for consistency) ---
      if (cmd && !shift && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (cmd && shift && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Skip remaining shortcuts when typing
      if (isTyping) return;

      // --- PLAYBACK ---
      if (e.code === 'Space' && !cmd) {
        e.preventDefault();
        setIsPlaying(prev => !prev);
        return;
      }

      // --- SPLIT ---
      if ((e.key === 'm' || e.key === 'M') && !cmd) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }
      if (cmd && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }

      // --- DELETE ---
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const selId = selectedClipIdRef.current;
        if (selId) {
          setClips(prev => prev.filter(c => c.id !== selId));
          setSelectedClipId(null);
        }
        return;
      }

      // --- COPY ---
      if (cmd && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        const selId = selectedClipIdRef.current;
        const clip = clipsRef.current.find(c => c.id === selId);
        if (clip) setClipboard({ clip: { ...clip } });
        return;
      }

      // --- PASTE ---
      if (cmd && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        const cb = clipboardRef.current;
        if (!cb) return;
        const newId = genId();
        setClips(prev => {
          const sameTrack = prev.filter(c => c.trackIndex === cb.clip.trackIndex);
          const startTime = sameTrack.length > 0 ? Math.max(...sameTrack.map(c => c.startTime + c.duration)) : 0;
          return [...prev, { ...cb.clip, id: newId, startTime }];
        });
        setSelectedClipId(newId);
        return;
      }

      // --- DUPLICATE ---
      if (cmd && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const selId = selectedClipIdRef.current;
        const clip = clipsRef.current.find(c => c.id === selId);
        if (!clip) return;
        const newId = genId();
        setClips(prev => [...prev, { ...clip, id: newId, startTime: clip.startTime + clip.duration }]);
        setSelectedClipId(newId);
        return;
      }

      // --- SELECT ALL ---
      if (cmd && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const all = clipsRef.current;
        if (all.length > 0) setSelectedClipId(all[0].id);
        return;
      }

      // --- FRAME STEP ---
      if (e.key === '[') {
        e.preventDefault();
        setCurrentTime(prev => Math.max(0, prev - FRAME_DURATION));
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        setCurrentTime(prev => prev + FRAME_DURATION);
        return;
      }

      // --- TRIM LEFT (Q) ---
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        trimLeft();
        return;
      }

      // --- TRIM RIGHT (W) ---
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        trimRight();
        return;
      }

      // --- ARROW KEYS: Nudge ---
      if (e.key === 'ArrowLeft' && !cmd) {
        e.preventDefault();
        nudge(-1, 0);
        return;
      }
      if (e.key === 'ArrowRight' && !cmd) {
        e.preventDefault();
        nudge(1, 0);
        return;
      }
      if (e.key === 'ArrowUp' && !cmd) {
        e.preventDefault();
        nudge(0, -1);
        return;
      }
      if (e.key === 'ArrowDown' && !cmd) {
        e.preventDefault();
        nudge(0, 1);
        return;
      }

      // --- ESCAPE ---
      if (e.key === 'Escape') {
        setSelectedClipId(null);
        return;
      }
    };

    // Helper functions that read from refs
    function splitAtPlayhead() {
      const selId = selectedClipIdRef.current;
      if (!selId) return;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      const t = currentTimeRef.current;
      if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
      const firstDur = t - clip.startTime;
      const secondDur = clip.duration - firstDur;
      const secondId = `clip_${Date.now()}_${clipIdCounter.current++}`;
      setClips(prev => [
        ...prev.map(c => c.id === clip.id ? { ...c, duration: firstDur } : c),
        { ...clip, id: secondId, startTime: t, duration: secondDur },
      ]);
      setSelectedClipId(secondId);
    }

    function trimLeft() {
      const selId = selectedClipIdRef.current;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      const t = currentTimeRef.current;
      const clipEnd = clip.startTime + clip.duration;
      if (t <= clip.startTime || t >= clipEnd) return;
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: t, duration: clipEnd - t } : c));
    }

    function trimRight() {
      const selId = selectedClipIdRef.current;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      const t = currentTimeRef.current;
      if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: t - clip.startTime } : c));
    }

    function nudge(dx: number, dy: number) {
      const selId = selectedClipIdRef.current;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      setClips(prev => prev.map(c => c.id === clip.id ? {
        ...c,
        positionX: (c.positionX ?? 0) + dx,
        positionY: (c.positionY ?? 0) + dy,
      } : c));
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, handleFitToScreen]);

  // Sync video playbackRate when selected clip changes
  useEffect(() => {
    if (videoRef.current && selectedClip && selectedClip.trackIndex === 1) {
      videoRef.current.playbackRate = selectedClip.speed ?? 1;
    }
  }, [selectedClip]);

  // Effects
  const handleSoundEffect = useCallback(() => alert('효과음 라이브러리'), []);
  const handleSticker = useCallback(() => alert('스티커 라이브러리'), []);
  const handleAutoColorCorrection = useCallback(() => {
    if (selectedClip) { handleClipUpdate(selectedClip.id, { autoColorCorrection: true }); alert('자동 색상 보정 적용'); }
    else alert('영상을 선택해주세요.');
  }, [selectedClip, handleClipUpdate]);
  const handleAnimationEffect = useCallback(() => {
    if (selectedClip) {
      const fx = ['fadeIn', 'slideIn', 'zoomIn', 'bounce'];
      handleClipUpdate(selectedClip.id, { animationEffect: fx[Math.floor(Math.random() * fx.length)] });
      alert('애니메이션 효과 적용');
    } else alert('구간을 선택해주세요.');
  }, [selectedClip, handleClipUpdate]);

  // ===== ADD TEXT CLIP from preset (click or drag) =====
  const handleAddTextClip = useCallback((preset: SubtitlePreset) => {
    const clipId = genId();
    const t = currentTimeRef.current;
    setClips(prev => [...prev, {
      id: clipId,
      name: '텍스트를 입력하세요',
      url: '',
      startTime: t,
      duration: 3,
      trackIndex: 0,
      scale: 100,
      positionX: 0,
      positionY: 0,
      rotation: 0,
      opacity: 100,
      blendMode: false,
      speed: 1,
      linked: false,
    }]);
    setSelectedClipId(clipId);
  }, []);

  const handlePresetDrop = useCallback((preset: SubtitlePreset, _x: number, _y: number) => {
    handleAddTextClip(preset);
  }, [handleAddTextClip]);

  // ===== DRAG & DROP on entire app =====
  const importFile = useCallback((file: File) => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.srt') || fileName.endsWith('.ass') || fileName.endsWith('.ssa')) {
      handleSubtitleImport(file);
      setImportToast('자막 파일이 추가되었습니다 ✓');
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/')) {
      handleVideoAdd(file);
      setImportToast('파일이 추가되었습니다 ✓');
    } else {
      setImportToast('지원하지 않는 파일 형식입니다');
    }
    setTimeout(() => setImportToast(null), 2500);
  }, [handleVideoAdd, handleSubtitleImport]);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // relatedTarget === null means cursor left the window
    if (!e.relatedTarget) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    Array.from(e.dataTransfer.files).forEach(importFile);
  }, [importFile]);

  // Callbacks for Timeline toolbar buttons (used for split/trim from toolbar)
  const handleSplit = useCallback(() => {
    const selId = selectedClipIdRef.current;
    if (!selId) return;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = currentTimeRef.current;
    if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
    const firstDur = t - clip.startTime;
    const secondDur = clip.duration - firstDur;
    const secondId = genId();
    setClips(prev => [
      ...prev.map(c => c.id === clip.id ? { ...c, duration: firstDur } : c),
      { ...clip, id: secondId, startTime: t, duration: secondDur },
    ]);
    setSelectedClipId(secondId);
  }, []);

  const handleTrimLeft = useCallback(() => {
    const selId = selectedClipIdRef.current;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = currentTimeRef.current;
    const clipEnd = clip.startTime + clip.duration;
    if (t <= clip.startTime || t >= clipEnd) return;
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: t, duration: clipEnd - t } : c));
  }, []);

  const handleTrimRight = useCallback(() => {
    const selId = selectedClipIdRef.current;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = currentTimeRef.current;
    if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: t - clip.startTime } : c));
  }, []);

  return (
    <div 
      className="bg-editor-bg text-white font-display h-screen flex flex-col overflow-hidden selection:bg-primary/30" 
      tabIndex={-1}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {/* Drop overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-4 border-dashed border-[#00D4D4] rounded-2xl p-16 flex flex-col items-center gap-4 bg-black/60">
            <span className="text-7xl">📁</span>
            <span className="text-3xl font-bold text-white">파일을 여기에 놓으세요</span>
            <span className="text-lg text-gray-400">동영상, 사진, 오디오, 자막 파일 지원</span>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {importToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] bg-gray-900 border border-[#00D4D4] rounded-lg px-6 py-3 shadow-2xl animate-fade-in">
          <span className="text-white text-sm font-medium">{importToast}</span>
        </div>
      )}

      <Header
        activeFileName={activeFileName}
        activeFileDuration={activeFileDuration}
        onRename={handleRename}
      />
      <SecondaryToolbar
        onTabChange={setActiveTab}
        onSoundEffect={handleSoundEffect}
        onSticker={handleSticker}
        onAutoColorCorrection={handleAutoColorCorrection}
        onAnimationEffect={handleAnimationEffect}
      />
      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar 
          onVideoAdd={handleVideoAdd} 
          onSubtitleImport={handleSubtitleImport}
          clips={clips}
          selectedClipId={selectedClipId}
          onClipSelect={handleClipSelect}
        />
        <Player
          videoUrl={currentVideoUrl}
          currentTime={currentTime}
          selectedClipId={selectedClipId}
          clips={clips}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
          onTimeUpdate={setCurrentTime}
          onSeek={handleSeek}
          onClipSelect={handleClipSelect}
          onClipDelete={handleClipDelete}
          onClipUpdate={handleClipUpdate}
          videoRefCallback={(ref) => { videoRef.current = ref; }}
          onPresetDrop={handlePresetDrop}
        />
        <RightSidebar
          transcripts={transcripts}
          subtitles={subtitles}
          currentTime={currentTime}
          selectedClip={selectedClip}
          videoFile={currentVideoFile}
          clips={clips}
          onTranscriptsUpdate={setTranscripts}
          onSubtitlesUpdate={setSubtitles}
          onSeek={handleSeek}
          onClipUpdate={handleClipUpdate}
          onAddSubtitleClips={handleAddSubtitleClips}
          onAddTextClip={handleAddTextClip}
        />
      </div>
      <Timeline
        clips={clips}
        playheadPosition={currentTime}
        selectedClipId={selectedClipId}
        zoom={timelineZoom}
        onZoomChange={setTimelineZoom}
        snapEnabled={snapEnabled}
        onSnapToggle={() => setSnapEnabled(prev => !prev)}
        onPlayheadChange={handlePlayheadChange}
        onClipAdd={handleClipAdd}
        onClipUpdate={handleClipUpdate}
        onClipSelect={handleClipSelect}
        onClipDelete={handleClipDelete}
        onSplit={handleSplit}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSpeedChange={handleSpeedChange}
        onFitToScreen={handleFitToScreen}
        onTrimLeft={handleTrimLeft}
        onTrimRight={handleTrimRight}
        isTimelineHovered={isTimelineHovered}
        onHoverChange={setIsTimelineHovered}
      />
    </div>
  );
}
