'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/components/auth/AuthProvider';
import type { VideoClip } from '@/types/video';
import type { TranscriptItem } from '@/types/subtitle';

interface HeaderProps {
  activeFileName?: string;
  activeFileDuration?: number;
  onRename?: (newName: string) => void;
  onExport?: () => void;
  onImport?: () => void;
  onOpenShortcuts?: () => void;
  videoFile?: File | null;
  videoDuration?: number;
  clips?: VideoClip[];
  transcripts?: TranscriptItem[];
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

const RESOLUTIONS = [
  { label: '4K', sub: '3840×2160', w: 3840, h: 2160, ratio: '16:9' },
  { label: '2K', sub: '2560×1440', w: 2560, h: 1440, ratio: '16:9' },
  { label: '1080p', sub: '1920×1080', w: 1920, h: 1080, ratio: '16:9' },
  { label: '4K', sub: '2160×3840', w: 2160, h: 3840, ratio: '9:16' },
  { label: '2K', sub: '1440×2560', w: 1440, h: 2560, ratio: '9:16' },
  { label: '숏츠 / 릴스', sub: '1080×1920', w: 1080, h: 1920, ratio: '9:16' },
  { label: '정사각', sub: '1080×1080', w: 1080, h: 1080, ratio: '1:1' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Header({
  activeFileName, activeFileDuration, onRename,
  onExport, onImport, onOpenShortcuts,
  videoFile, videoDuration, clips = [], transcripts = [],
}: HeaderProps) {
  const { isAdmin: rawIsAdmin, user, isAuthenticated, signIn, signOut } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState(2); // 1080p default
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);
  const isAdmin = mounted && rawIsAdmin;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const displayTitle = activeFileName
    ? `${activeFileName}${activeFileDuration ? ` - ${formatDuration(activeFileDuration)}` : ''}`
    : '0213 (2)';

  const handleTitleClick = () => {
    if (activeFileName) {
      setEditName(activeFileName);
      setIsEditing(true);
    }
  };

  const handleRenameSubmit = () => {
    if (editName.trim() && onRename) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ===== Export logic =====
  const duration = videoDuration ?? 0;
  const baseName = videoFile?.name?.replace(/\.[^.]+$/, '') ?? 'export';
  const res = RESOLUTIONS[selectedResolution];

  const allTexts = useMemo(() => {
    const fromTranscripts = transcripts.map(t => ({
      startTime: t.startTime,
      endTime: t.endTime,
      text: t.editedText || t.originalText,
    }));
    const fromClips = clips
      .filter(c => c.trackIndex !== 1 && c.name)
      .map(c => ({ startTime: c.startTime, endTime: c.startTime + c.duration, text: c.name || '' }));
    return [...fromTranscripts, ...fromClips].sort((a, b) => a.startTime - b.startTime);
  }, [transcripts, clips]);

  const estimatedMp4 = useMemo(() => {
    if (!duration) return 0;
    const pixelCount = res.w * res.h;
    const bitsPerPixel = 0.07;
    const bitrate = pixelCount * bitsPerPixel * 30;
    return (bitrate * duration) / 8;
  }, [duration, res]);

  const srtContent = useMemo(() => {
    const fmtTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      const ms = Math.round((s % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    return allTexts.map((t, i) =>
      `${i + 1}\n${fmtTime(t.startTime)} --> ${fmtTime(t.endTime)}\n${t.text}\n`
    ).join('\n');
  }, [allTexts]);

  const txtContent = useMemo(() => allTexts.map(t => t.text).join('\n'), [allTexts]);
  const srtSize = useMemo(() => new Blob([srtContent]).size, [srtContent]);
  const txtSize = useMemo(() => new Blob([txtContent]).size, [txtContent]);
  const mp3Size = useMemo(() => duration ? Math.round(duration * 16000) : 0, [duration]);

  const getVideoBlob = useCallback(async (): Promise<{ blob: Blob; name: string } | null> => {
    if (videoFile) return { blob: videoFile, name: videoFile.name };
    const videoClip = clips.find(c => c.trackIndex === 1 && c.url);
    if (videoClip?.url) {
      try {
        const r = await fetch(videoClip.url);
        if (r.ok) return { blob: await r.blob(), name: videoClip.name || 'video.mp4' };
      } catch { /* fallback */ }
    }
    const videoEl = document.querySelector('video[src]') as HTMLVideoElement | null;
    if (videoEl?.src) {
      try {
        const r = await fetch(videoEl.src);
        if (r.ok) return { blob: await r.blob(), name: 'video.mp4' };
      } catch { /* ignore */ }
    }
    return null;
  }, [videoFile, clips]);

  const saveWithPicker = useCallback(async (blob: Blob, suggestedName: string, description: string, accept: Record<string, string[]>) => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{ description, accept }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (err: any) {
        if (err.name === 'AbortError') return false;
      }
    }
    // Fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = suggestedName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }, []);

  const handleDownloadMp4 = useCallback(async () => {
    const video = await getVideoBlob();
    if (!video) { alert('영상 파일이 필요합니다.'); return; }
    await saveWithPicker(video.blob, `${baseName}_${res.w}x${res.h}.mp4`, 'MP4 영상', { 'video/mp4': ['.mp4'] });
  }, [getVideoBlob, baseName, res, saveWithPicker]);

  const handleDownloadMp3 = useCallback(async () => {
    const video = await getVideoBlob();
    if (!video) { alert('영상 파일이 필요합니다.'); return; }
    setIsExporting(true); setExportProgress(10);
    try {
      const arrayBuffer = await video.blob.arrayBuffer();
      setExportProgress(30);
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      setExportProgress(50);
      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;
      const wavBuffer = new ArrayBuffer(44 + length * numChannels * 2);
      const view = new DataView(wavBuffer);
      const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + length * numChannels * 2, true);
      writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * 2, true);
      view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true);
      writeStr(36, 'data'); view.setUint32(40, length * numChannels * 2, true);
      setExportProgress(70);
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }
      setExportProgress(90);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      await saveWithPicker(blob, `${baseName}.wav`, 'WAV 오디오', { 'audio/wav': ['.wav'] });
      audioCtx.close(); setExportProgress(100);
    } catch (err: any) {
      alert(`오디오 추출 실패: ${err.message}`);
    } finally {
      setTimeout(() => { setIsExporting(false); setExportProgress(0); }, 1000);
    }
  }, [getVideoBlob, baseName, saveWithPicker]);

  const handleDownloadSrt = useCallback(async () => {
    const blob = new Blob(['\uFEFF' + srtContent], { type: 'text/plain;charset=utf-8' });
    await saveWithPicker(blob, `${baseName}.srt`, 'SRT 자막', { 'text/plain': ['.srt'] });
  }, [srtContent, baseName, saveWithPicker]);

  const handleDownloadTxt = useCallback(async () => {
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    await saveWithPicker(blob, `${baseName}.txt`, 'TXT 대본', { 'text/plain': ['.txt'] });
  }, [txtContent, baseName, saveWithPicker]);

  // FCPXML (Final Cut Pro) 내보내기
  const handleDownloadFcpxml = useCallback(async () => {
    const fps = 30;
    const frameDur = `100/3000s`; // 30fps
    const totalFrames = Math.round(duration * fps);
    const videoName = videoFile?.name || 'video.mp4';

    const toFcpTime = (sec: number) => `${Math.round(sec * fps * 100)}/3000s`;

    // Build clip-items from video clips on track 1
    const videoClips = clips.filter(c => c.trackIndex === 1).sort((a, b) => a.startTime - b.startTime);
    const clipItems = videoClips.map((c, i) => {
      const offset = toFcpTime(c.startTime);
      const dur = toFcpTime(c.duration);
      const start = toFcpTime(c.trimStart ?? 0);
      return `            <asset-clip ref="r2" offset="${offset}" name="${videoName} ${i + 1}" duration="${dur}" start="${start}" tcFormat="NDF"/>`;
    }).join('\n');

    // Build title items from transcripts
    const titleItems = allTexts.map((t, i) => {
      const offset = toFcpTime(t.startTime);
      const dur = toFcpTime(t.endTime - t.startTime);
      const escaped = t.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `            <title ref="r3" offset="${offset}" name="자막 ${i + 1}" duration="${dur}">
              <text><text-style ref="ts1">${escaped}</text-style></text>
            </title>`;
    }).join('\n');

    const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat1080p30" frameDuration="${frameDur}" width="${res.w}" height="${res.h}"/>
    <asset id="r2" name="${videoName}" start="0s" duration="${toFcpTime(duration)}" hasVideo="1" hasAudio="1">
      <media-rep kind="original-media" src="file://./${videoName}"/>
    </asset>
    <effect id="r3" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>
  </resources>
  <library>
    <event name="${baseName}">
      <project name="${baseName}">
        <sequence format="r1" duration="${toFcpTime(duration)}" tcStart="0s" tcFormat="NDF">
          <spine>
${clipItems}
          </spine>
          <lane number="1">
${titleItems}
          </lane>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;

    const blob = new Blob([fcpxml], { type: 'application/xml;charset=utf-8' });
    await saveWithPicker(blob, `${baseName}.fcpxml`, 'Final Cut Pro XML', { 'application/xml': ['.fcpxml'] });
  }, [duration, videoFile, clips, allTexts, baseName, res, saveWithPicker]);

  // Premiere Pro XML (FCP7 XML 호환) 내보내기
  const handleDownloadPremiereXml = useCallback(async () => {
    const fps = 30;
    const videoName = videoFile?.name || 'video.mp4';
    const timebase = fps;

    const toFrames = (sec: number) => Math.round(sec * fps);

    const videoClips = clips.filter(c => c.trackIndex === 1).sort((a, b) => a.startTime - b.startTime);
    const clipEntries = videoClips.map((c, i) => {
      const inPt = toFrames(c.trimStart ?? 0);
      const outPt = inPt + toFrames(c.duration);
      const start = toFrames(c.startTime);
      const end = start + toFrames(c.duration);
      return `          <clipitem id="clipitem-${i + 1}">
            <name>${videoName}</name>
            <duration>${toFrames(duration)}</duration>
            <rate><timebase>${timebase}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${start}</start>
            <end>${end}</end>
            <in>${inPt}</in>
            <out>${outPt}</out>
            <file id="file-1"/>
          </clipitem>`;
    }).join('\n');

    const subtitleEntries = allTexts.map((t, i) => {
      const start = toFrames(t.startTime);
      const end = toFrames(t.endTime);
      const escaped = t.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `          <generatoritem id="subtitle-${i + 1}">
            <name>${escaped}</name>
            <duration>${end - start}</duration>
            <rate><timebase>${timebase}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${start}</start>
            <end>${end}</end>
            <in>0</in>
            <out>${end - start}</out>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effecttype>generator</effecttype>
              <parameter>
                <parameterid>str</parameterid>
                <name>Text</name>
                <value>${escaped}</value>
              </parameter>
            </effect>
          </generatoritem>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${baseName}</name>
    <duration>${toFrames(duration)}</duration>
    <rate><timebase>${timebase}</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${res.w}</width>
            <height>${res.h}</height>
          </samplecharacteristics>
        </format>
        <track>
${clipEntries}
        </track>
        <track>
${subtitleEntries}
        </track>
      </video>
      <audio>
        <track>
${videoClips.map((c, i) => {
  const inPt = toFrames(c.trimStart ?? 0);
  const outPt = inPt + toFrames(c.duration);
  const start = toFrames(c.startTime);
  const end = start + toFrames(c.duration);
  return `          <clipitem id="audio-${i + 1}">
            <name>${videoName}</name>
            <duration>${toFrames(duration)}</duration>
            <rate><timebase>${timebase}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${start}</start>
            <end>${end}</end>
            <in>${inPt}</in>
            <out>${outPt}</out>
            <file id="file-1"/>
          </clipitem>`;
}).join('\n')}
        </track>
      </audio>
    </media>
    <file id="file-1">
      <name>${videoName}</name>
      <pathurl>file://localhost/./${videoName}</pathurl>
      <duration>${toFrames(duration)}</duration>
      <rate><timebase>${timebase}</timebase><ntsc>FALSE</ntsc></rate>
      <media>
        <video>
          <samplecharacteristics>
            <width>${res.w}</width>
            <height>${res.h}</height>
          </samplecharacteristics>
        </video>
        <audio>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </audio>
      </media>
    </file>
  </sequence>
</xmeml>`;

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    await saveWithPicker(blob, `${baseName}.xml`, 'Premiere Pro XML', { 'application/xml': ['.xml'] });
  }, [duration, videoFile, clips, allTexts, baseName, res, saveWithPicker]);

  const hasVideo = !!videoFile || clips.some(c => c.trackIndex === 1 && c.url);
  const exportItems = useMemo(() => [
    { icon: 'movie', label: 'MP4 영상', desc: `${res.w}x${res.h}`, size: estimatedMp4, action: handleDownloadMp4, disabled: !hasVideo },
    { icon: 'music_note', label: 'WAV 오디오', desc: 'WAV 추출', size: mp3Size, action: handleDownloadMp3, disabled: !hasVideo },
    { icon: 'subtitles', label: 'SRT 자막', desc: `${allTexts.length}개 항목`, size: srtSize, action: handleDownloadSrt, disabled: allTexts.length === 0 },
    { icon: 'description', label: 'TXT 대본', desc: `${allTexts.length}개 항목`, size: txtSize, action: handleDownloadTxt, disabled: allTexts.length === 0 },
    { icon: 'theaters', label: 'Final Cut Pro', desc: 'FCPXML 프로젝트', size: 0, action: handleDownloadFcpxml, disabled: !hasVideo && allTexts.length === 0 },
    { icon: 'video_settings', label: 'Premiere Pro', desc: 'XML 프로젝트', size: 0, action: handleDownloadPremiereXml, disabled: !hasVideo && allTexts.length === 0 },
  ], [res, estimatedMp4, mp3Size, srtSize, txtSize, allTexts.length, hasVideo, handleDownloadMp4, handleDownloadMp3, handleDownloadSrt, handleDownloadTxt, handleDownloadFcpxml, handleDownloadPremiereXml]);

  const menus: { id: string; label: string; icon: string; items: MenuItem[] }[] = [
    {
      id: 'file',
      label: 'File',
      icon: 'folder',
      items: [
        { label: '새 프로젝트', shortcut: '⌘N', action: () => { if (confirm('새 프로젝트를 시작하시겠습니까?')) window.location.reload(); } },
        { label: '가져오기', shortcut: '⌘I', action: onImport },
        { label: '자막 파일 가져오기', action: onImport },
        { label: '', divider: true },
        { label: '저장', shortcut: '⌘S', action: () => alert('프로젝트가 저장되었습니다 ✓') },
        { label: '다른 이름으로 저장', shortcut: '⌘⇧S', action: () => alert('다른 이름으로 저장 완료 ✓') },
        { label: '', divider: true },
        { label: '내보내기', shortcut: '⌘E', action: onExport },
        { label: '프로젝트 설정', action: () => alert('프로젝트 설정') },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      icon: 'help_outline',
      items: [
        { label: '단축키 설정', action: onOpenShortcuts },
        { label: '사용 가이드', action: () => alert('사용 가이드가 준비 중입니다.') },
        { label: '', divider: true },
        { label: '피드백 보내기', action: () => alert('피드백을 보내주셔서 감사합니다!') },
        { label: '버전 정보', action: () => alert('AutoText v2.0.0\n© 2026 AutoText') },
      ],
    },
  ];

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.disabled || item.divider) return;
    setOpenMenu(null);
    item.action?.();
  };

  return (
    <header className="h-12 border-b border-border-color bg-editor-bg flex items-center justify-between px-4 shrink-0 select-none z-50">
      {/* Left: Window Controls & Menu */}
      <div className="flex items-center space-x-4" ref={menuRef}>
        <div className="flex space-x-2 group">
          <div className="w-3 h-3 rounded-full bg-red-500 group-hover:bg-red-600 transition-colors cursor-pointer" onClick={() => { if (confirm('창을 닫으시겠습니까?')) window.close(); }}></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500 group-hover:bg-yellow-600 transition-colors cursor-pointer" onClick={() => alert('최소화')}></div>
          <div className="w-3 h-3 rounded-full bg-green-500 group-hover:bg-green-600 transition-colors cursor-pointer" onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }}></div>
        </div>
        {/* Home & Projects */}
        <div className="flex items-center gap-1 pl-3 border-l border-white/10">
          <button
            onClick={() => router.push('/landing')}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-cyan-400 transition-all relative group/home"
            title="홈 (랜딩페이지)"
          >
            <span className="material-icons text-lg">home</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] text-white bg-gray-800 rounded opacity-0 group-hover/home:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">홈</span>
          </button>
          <button
            onClick={() => router.push('/projects')}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all relative group/proj"
            title="프로젝트 보관함"
          >
            <span className="material-icons text-lg">movie</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] text-white bg-gray-800 rounded opacity-0 group-hover/proj:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">프로젝트 보관함</span>
          </button>
        </div>
        <nav className="flex space-x-1 text-xs font-medium pl-4">
          {menus.map(menu => (
            <div key={menu.id} className="relative">
              <button
                className={`text-white hover:text-primary transition-all duration-200 p-1.5 rounded hover:bg-white/10 relative group active:scale-90 ${openMenu === menu.id ? 'text-primary bg-white/10' : ''
                  }`}
                onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                onMouseEnter={() => { if (openMenu) setOpenMenu(menu.id); }}
                title={menu.label}
              >
                <span className="material-icons text-lg">{menu.icon}</span>
              </button>

              {/* Dropdown Menu */}
              {openMenu === menu.id && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl py-1.5 z-[100] animate-in fade-in slide-in-from-top-1">
                  {menu.items.map((item, idx) =>
                    item.divider ? (
                      <div key={idx} className="h-px bg-white/10 my-1 mx-3"></div>
                    ) : (
                      <button
                        key={idx}
                        onClick={() => handleMenuItemClick(item)}
                        disabled={item.disabled}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${item.disabled
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-300 hover:text-white hover:bg-white/10'
                          }`}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <span className="text-gray-600 text-[10px] font-mono ml-4">{item.shortcut}</span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Center: Project Title / Filename */}
      <div className="flex items-center space-x-2">
        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setIsEditing(false); }}
            className="text-sm font-semibold bg-black/50 border border-primary rounded px-2 py-0.5 text-white focus:outline-none max-w-[300px]"
          />
        ) : (
          <span
            className={`text-sm font-semibold truncate max-w-[350px] ${activeFileName ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
            onClick={handleTitleClick}
            title={activeFileName ? 'Click to rename' : ''}
          >
            {displayTitle}
          </span>
        )}
        <span className="text-xs text-text-secondary bg-border-color/30 px-2 py-0.5 rounded">Auto Saved</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-3">
        {/* Admin Dashboard Link — only visible to admins */}
        {isAdmin && (
          <a
            href="/admin/analytics"
            className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:text-[#00D4D4] transition-all duration-200 relative group active:scale-90 hover:scale-110"
            title="관리자 대시보드"
          >
            <span className="material-icons text-xl">analytics</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              관리자 대시보드
            </span>
          </a>
        )}
        <button
          className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:text-primary transition-all duration-200 relative group active:scale-90 hover:scale-110"
          title="단축키 설정"
          onClick={onOpenShortcuts}
        >
          <span className="material-icons text-xl">keyboard</span>
        </button>
        <div className="relative" ref={exportRef}>
          <button
            className="bg-primary hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-all duration-200 shadow-lg shadow-primary/30 flex items-center gap-1.5 active:scale-95 hover:scale-105"
            title="Export"
            onClick={() => setExportOpen(prev => !prev)}
          >
            <span className="material-icons text-lg">file_download</span>
            <span className="text-xs font-semibold">Export</span>
            <span className="material-icons text-sm">{exportOpen ? 'expand_less' : 'expand_more'}</span>
          </button>

          {exportOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-80 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl py-3 z-[100] animate-in fade-in slide-in-from-top-1">
              {/* Resolution selector — 비율별 그룹 */}
              <div className="px-4 pb-3 border-b border-white/10 space-y-2">
                {/* 16:9 가로 */}
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">16:9 가로</span>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {RESOLUTIONS.filter(r => r.ratio === '16:9').map((r) => {
                      const idx = RESOLUTIONS.indexOf(r);
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedResolution(idx)}
                          className={`text-center px-1.5 py-1.5 rounded-lg transition-all ${
                            selectedResolution === idx
                              ? 'bg-primary/20 border border-primary/50 text-white'
                              : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10 hover:text-gray-300'
                          }`}
                        >
                          <div className="text-[11px] font-medium">{r.label}</div>
                          <div className="text-[9px] text-gray-500">{r.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* 9:16 세로 + 1:1 정사각 */}
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">세로 / 정사각</span>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {RESOLUTIONS.filter(r => r.ratio !== '16:9').map((r) => {
                      const idx = RESOLUTIONS.indexOf(r);
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedResolution(idx)}
                          className={`text-center px-1.5 py-1.5 rounded-lg transition-all ${
                            selectedResolution === idx
                              ? 'bg-primary/20 border border-primary/50 text-white'
                              : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10 hover:text-gray-300'
                          }`}
                        >
                          <div className="text-[11px] font-medium">{r.label}</div>
                          <div className="text-[9px] text-gray-500">{r.sub} · {r.ratio}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Download items */}
              <div className="px-3 pt-3 space-y-1.5">
                {exportItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => { item.action(); setExportOpen(false); }}
                    disabled={item.disabled || isExporting}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
                      item.disabled
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-white hover:bg-white/10 active:scale-[0.98]'
                    }`}
                  >
                    <span className={`material-icons text-lg ${item.disabled ? 'text-gray-600' : 'text-primary'}`}>
                      {item.icon}
                    </span>
                    <div className="flex-1 text-left">
                      <div className="text-xs font-medium">{item.label}</div>
                      <div className="text-[10px] text-gray-500">{item.desc}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-500">{item.size > 0 ? formatFileSize(item.size) : '-'}</div>
                      <span className={`material-icons text-sm ${item.disabled ? 'text-gray-700' : 'text-gray-400 group-hover:text-primary'}`}>
                        file_download
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Progress bar */}
              {isExporting && (
                <div className="px-4 pt-2 space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>추출 중...</span>
                    <span>{exportProgress}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Project JSON export */}
              <div className="px-3 pt-2 mt-1 border-t border-white/10">
                <button
                  onClick={() => { onExport?.(); setExportOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                >
                  <span className="material-icons text-lg">save</span>
                  <div className="text-left">
                    <div className="text-xs font-medium">프로젝트 저장 (JSON)</div>
                    <div className="text-[10px] text-gray-500">프로젝트 파일 내보내기</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile / Login */}
        {mounted && (
          isAuthenticated && user ? (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-lg hover:bg-white/10 transition-all group"
                title={user.name ?? '프로필'}
              >
                {user.image ? (
                  <Image
                    src={user.image}
                    alt={user.name ?? ''}
                    width={26}
                    height={26}
                    className="rounded-full ring-1 ring-white/20 group-hover:ring-[#00D4D4]/60 transition-all"
                  />
                ) : (
                  <div className="w-[26px] h-[26px] rounded-full bg-[#00D4D4]/20 flex items-center justify-center ring-1 ring-[#00D4D4]/40">
                    <span className="material-icons text-[14px] text-[#00D4D4]">person</span>
                  </div>
                )}
                <span className="text-xs text-gray-300 group-hover:text-white transition-colors max-w-[90px] truncate hidden sm:block">
                  {user.name?.split(' ')[0]}
                </span>
                <span className="material-icons text-[14px] text-gray-500">expand_more</span>
              </button>

              {profileOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-52 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl py-2 z-[100] animate-in fade-in slide-in-from-top-1">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-3 mb-1">
                      {user.image ? (
                        <Image src={user.image} alt="" width={32} height={32} className="rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#00D4D4]/20 flex items-center justify-center">
                          <span className="material-icons text-[16px] text-[#00D4D4]">person</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{user.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#00D4D4] bg-[#00D4D4]/10 px-2 py-0.5 rounded-full mt-1">
                        <span className="material-icons text-[11px]">shield</span>
                        관리자
                      </span>
                    )}
                  </div>

                  {/* Menu items */}
                  {isAdmin && (
                    <a
                      href="/admin/analytics"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      onClick={() => setProfileOpen(false)}
                    >
                      <span className="material-icons text-[16px] text-[#00D4D4]">analytics</span>
                      관리자 대시보드
                    </a>
                  )}
                  <button
                    onClick={() => { setProfileOpen(false); router.push('/projects'); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <span className="material-icons text-[16px] text-gray-500">folder</span>
                    내 프로젝트
                  </button>
                  <div className="h-px bg-white/10 mx-3 my-1" />
                  <button
                    onClick={() => { setProfileOpen(false); signOut(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <span className="material-icons text-[16px]">logout</span>
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => signIn()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google 로그인
            </button>
          )
        )}
      </div>
    </header>
  );
}

