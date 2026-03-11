'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeVideo } from '@/lib/sttService';
import { parseSubtitleFile } from '@/lib/subtitleParser';
import { generateSubtitlesFromAudio, type TranscriptDataForAI } from '@/lib/geminiAudioService';
import type { TranscriptItem, SubtitleItem, SubtitleAnimation } from '@/types/subtitle';
import type { VideoClip } from '@/types/video';
import { SUBTITLE_PRESETS, FONT_FAMILIES, type SubtitlePreset, loadCustomPresets, addCustomPreset, deleteCustomPreset } from '@/lib/subtitlePresets';
import UpgradeModal from '@/components/payment/UpgradeModal';
import SubtitleAnimationPanel from '@/components/editor/SubtitleAnimationPanel';

interface RightSidebarProps {
  transcripts?: TranscriptItem[];
  subtitles?: SubtitleItem[];
  currentTime?: number;
  selectedClip?: VideoClip | null;
  selectedClipIds?: string[];
  videoFile?: File | null;
  videoDuration?: number;
  clips?: VideoClip[];
  onTranscriptsUpdate?: (transcripts: TranscriptItem[]) => void;
  onSubtitlesUpdate?: (subtitles: SubtitleItem[]) => void;
  onSeek?: (time: number) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  onClipsBatchUpdate?: (clipIds: string[], updates: Partial<VideoClip>) => void;
  onAddSubtitleClips?: (items: TranscriptItem[], trackIndex?: number, replaceTrack?: boolean) => void;
  onAddTextClip?: (preset: SubtitlePreset) => void;
  onExport?: () => void;
}

const TranscriptItem = React.memo(({ t, isActive, isSelected, onSelect, onEdit, onDragStart, onMergeWithPrevious, onSplitAtCursor }: {
  t: TranscriptItem,
  isActive: boolean,
  isSelected: boolean,
  onSelect: (id: string, startTime: number) => void,
  onEdit: (id: string, text: string) => void,
  onDragStart: (e: React.DragEvent, text: string) => void,
  onMergeWithPrevious?: (id: string) => void,
  onSplitAtCursor?: (id: string, cursorPos: number) => void,
}) => {
  const text = t.editedText || t.originalText;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, text)}
      onClick={() => onSelect(t.id, t.startTime)}
      className={`group p-3 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${isActive
        ? 'bg-primary/10 border-primary/50 shadow-lg shadow-primary/10'
        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
        }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-2 w-2 rounded-full shrink-0 transition-all ${isActive ? 'bg-primary shadow-[0_0_8px_rgba(0,212,212,0.6)] animate-pulse' : 'bg-gray-700'}`} />
        <div className="flex-1 min-w-0">
          {isSelected ? (
            <textarea
              rows={2}
              value={text}
              onChange={(e) => onEdit(t.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && onMergeWithPrevious) {
                  const ta = e.currentTarget;
                  if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
                    e.preventDefault();
                    onMergeWithPrevious(t.id);
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey && onSplitAtCursor) {
                  e.preventDefault();
                  const pos = e.currentTarget.selectionStart ?? text.length;
                  if (pos > 0 && pos < text.length) {
                    onSplitAtCursor(t.id, pos);
                  }
                }
              }}
              className="w-full bg-black/40 border border-primary/30 rounded-md text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary transition-all resize-none"
            />
          ) : (
            <p className={`text-[13px] leading-relaxed ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>{text}</p>
          )}
          <div className={`mt-1 flex items-center gap-1.5 transition-opacity ${isSelected || isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <span className="text-[9px] text-gray-500 font-mono tracking-tighter">
              {fmtTimestamp(t.startTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

const RightSidebar = React.memo(({
  transcripts = [], subtitles = [], currentTime = 0, selectedClip = null, selectedClipIds = [], videoFile = null, videoDuration, clips = [],
  onTranscriptsUpdate, onSubtitlesUpdate, onSeek, onClipUpdate, onClipsBatchUpdate, onAddSubtitleClips, onAddTextClip, onExport,
}: RightSidebarProps) => {
  const [activeTab, setActiveTab] = useState<'details' | 'export' | 'caption'>('details');
  const [scale, setScale] = useState(selectedClip?.scale ?? 100);
  const [positionX, setPositionX] = useState(selectedClip?.positionX ?? 0);
  const [positionY, setPositionY] = useState(selectedClip?.positionY ?? 0);
  const [rotation, setRotation] = useState(selectedClip?.rotation ?? 0);
  const [opacity, setOpacity] = useState(selectedClip?.opacity ?? 100);
  const [blendMode, setBlendMode] = useState(selectedClip?.blendMode ?? false);
  const [selectedPresetId, setSelectedPresetId] = useState<number>(1);

  // Quota and Payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Generation status
  const [isGeminiGenerating, setIsGeminiGenerating] = useState(false);
  const [geminiProgress, setGeminiProgress] = useState(0);
  const [geminiStatus, setGeminiStatus] = useState('');
  const [isIntegratedGenerating, setIsIntegratedGenerating] = useState(false);
  const [integratedProgress, setIntegratedProgress] = useState(0);
  const [integratedStatus, setIntegratedStatus] = useState('');

  useEffect(() => {
    if (selectedClip) {
      setScale(selectedClip.scale ?? 100);
      setPositionX(selectedClip.positionX ?? 0);
      setPositionY(selectedClip.positionY ?? 0);
      setRotation(selectedClip.rotation ?? 0);
      setOpacity(selectedClip.opacity ?? 100);
      setBlendMode(selectedClip.blendMode ?? false);
    }
  }, [selectedClip]);

  const updateProp = useCallback((prop: keyof VideoClip, value: any) => {
    if (selectedClipIds.length > 0 && onClipUpdate) {
      selectedClipIds.forEach(id => {
        onClipUpdate(id, { [prop]: value });
      });
    } else if (selectedClip && onClipUpdate) {
      // Fallback in case selectedClipIds is not passed
      onClipUpdate(selectedClip.id, { [prop]: value });
    }
  }, [selectedClip, selectedClipIds, onClipUpdate]);

  // Caption states
  const [captionTab, setCaptionTab] = useState<'caption' | 'text' | 'animation' | 'tracking' | 'tts'>('caption');

  // AI Sound / TTS 상태
  const [soundPrompt, setSoundPrompt] = useState('');
  const [soundSuggestions, setSoundSuggestions] = useState<{ text: string; time: number }[]>([]);
  const [isGeneratingSound, setIsGeneratingSound] = useState(false);
  const [soundGenStatus, setSoundGenStatus] = useState('');

  // TTS (실제 음성 생성) 상태
  const [ttsText, setTtsText] = useState('');
  const [ttsVoice, setTtsVoice] = useState<'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'>('nova');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsStatus, setTtsStatus] = useState('');
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [applyToAllOnTrack, setApplyToAllOnTrack] = useState(true);
  const [customPresets, setCustomPresets] = useState<SubtitlePreset[]>(() => loadCustomPresets());
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [userScript, setUserScript] = useState('');
  const [aiScript, setAiScript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState('');
  const transcriptionAbortController = useRef<AbortController | null>(null);
  const geminiAbortController = useRef<AbortController | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const subtitleFileRef = useRef<HTMLInputElement>(null);

  // === AUTO PIPELINE STATE ===
  const [pipelineActive, setPipelineActive] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'stt' | 'ai' | 'done'>('idle');
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState('');
  const processedFileRef = useRef<string | null>(null);

  // === 트림된 클립 범위에 맞게 분석 결과 필터링/리매핑 ===
  // 미디어 시간(원본 영상 기준) → 타임라인 시간으로 변환
  const filterResultsToClipRanges = useCallback(<T extends { startTime: number; endTime: number }>(
    items: T[],
  ): T[] => {
    // 메인 트랙(1) 영상 클립만 가져오기
    const mainClips = (clips || []).filter(c => c.trackIndex === 1).sort((a, b) => a.startTime - b.startTime);
    if (mainClips.length === 0) return items;

    const filtered: T[] = [];
    for (const item of items) {
      for (const clip of mainClips) {
        const speed = clip.speed || 1;
        const mediaStart = clip.trimStart ?? 0;
        // Media duration covered = timeline duration * speed
        const mediaEnd = mediaStart + (clip.duration * speed);

        // 아이템이 이 클립의 미디어 범위 안에 있는지 확인
        if (item.startTime >= mediaStart && item.startTime < mediaEnd) {
          // 미디어 시간 → 타임라인 시간으로 변환 (account for speed)
          const timelineStart = clip.startTime + (item.startTime - mediaStart) / speed;
          const timelineEnd = Math.min(
            clip.startTime + clip.duration,
            clip.startTime + (item.endTime - mediaStart) / speed,
          );
          if (timelineEnd > timelineStart) {
            filtered.push({ ...item, startTime: timelineStart, endTime: timelineEnd });
          }
          break;
        }
      }
    }
    return filtered;
  }, [clips]);


  // Handle SRT/ASS file import
  // Stabilized callbacks for TranscriptItem performance
  const handleTranscriptSelect = useCallback((id: string, start: number) => {
    setSelectedTranscriptId(id);
    onSeek?.(start);
  }, [onSeek]);

  const handleSubtitleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const parsed = await parseSubtitleFile(file);
        onTranscriptsUpdate?.([...transcripts, ...parsed]);
      } catch (err: any) {
        alert(`자막 파일 파싱 실패: ${err.message}`);
      }
    }
    if (subtitleFileRef.current) subtitleFileRef.current.value = '';
  }, [transcripts, onTranscriptsUpdate]);

  // Edit transcript inline
  const handleTranscriptEdit = useCallback((id: string, newText: string) => {
    const updated = transcripts.map(t => t.id === id ? { ...t, editedText: newText, isEdited: true } : t);
    onTranscriptsUpdate?.(updated);
    // 타임라인 자막 클립도 동기화: transcript id 또는 같은 텍스트를 가진 클립 name 업데이트
    const original = transcripts.find(t => t.id === id);
    if (original && clips && onClipUpdate) {
      const originalText = original.editedText || original.originalText;
      clips
        .filter(c => !c.url && c.name === originalText)
        .forEach(c => onClipUpdate(c.id, { name: newText }));
    }
  }, [transcripts, onTranscriptsUpdate, clips, onClipUpdate]);

  const handleMergeWithPrevious = useCallback((id: string) => {
    const idx = transcripts.findIndex(t => t.id === id);
    if (idx <= 0) return;
    const prev = transcripts[idx - 1];
    const cur = transcripts[idx];
    const mergedText = (prev.editedText || prev.originalText) + ' ' + (cur.editedText || cur.originalText);
    const merged: TranscriptItem = {
      ...prev,
      editedText: mergedText,
      isEdited: true,
      endTime: Math.max(prev.endTime, cur.endTime),
    };
    const updated = transcripts.filter((_, i) => i !== idx).map(t => t.id === prev.id ? merged : t);
    onTranscriptsUpdate?.(updated);
    setSelectedTranscriptId(prev.id);
  }, [transcripts, onTranscriptsUpdate]);

  const handleSplitAtCursor = useCallback((id: string, cursorPos: number) => {
    const idx = transcripts.findIndex(t => t.id === id);
    if (idx < 0) return;
    const cur = transcripts[idx];
    const text = cur.editedText || cur.originalText;
    const textBefore = text.slice(0, cursorPos).trim();
    const textAfter = text.slice(cursorPos).trim();
    if (!textBefore || !textAfter) return;

    // Split time proportionally by text length
    const ratio = textBefore.length / text.length;
    const midTime = cur.startTime + (cur.endTime - cur.startTime) * ratio;

    const first: TranscriptItem = {
      ...cur,
      editedText: textBefore,
      isEdited: true,
      endTime: midTime,
    };
    const second: TranscriptItem = {
      ...cur,
      id: `${cur.id}_split_${Date.now()}`,
      editedText: textAfter,
      originalText: textAfter,
      isEdited: true,
      startTime: midTime,
    };
    const updated = [...transcripts];
    updated.splice(idx, 1, first, second);
    onTranscriptsUpdate?.(updated);
    setSelectedTranscriptId(second.id);
  }, [transcripts, onTranscriptsUpdate]);

  const handleAutoTranscribe = useCallback(async () => {
    if (!videoFile) { alert('비디오 파일이 필요합니다.'); return; }
    setIsTranscribing(true); setTranscriptionProgress(0); setTranscriptionStatus('음성 인식 준비 중...');
    transcriptionAbortController.current = new AbortController();
    try {
      const result = await transcribeVideo(videoFile, 'backend-proxy', (status) => {
        setTranscriptionStatus(status);
        if (status.includes('오디오 추출')) setTranscriptionProgress(20);
        else if (status.includes('파일 처리')) setTranscriptionProgress(40);
        else if (status.includes('음성 인식')) {
          const m = status.match(/(\d+)\/(\d+)/);
          if (m) setTranscriptionProgress(40 + (parseInt(m[1]) / parseInt(m[2])) * 50);
        } else if (status.includes('결과 병합')) setTranscriptionProgress(90);
        else if (status.includes('완료')) setTranscriptionProgress(100);
      });
      const newT: TranscriptItem[] = [];
      let seg: { words: typeof result.words; startTime: number } | null = null;
      for (const word of result.words) {
        if (!seg || word.startTime - seg.startTime >= 3) {
          if (seg) {
            newT.push({ id: `t_${Date.now()}_${newT.length}`, startTime: seg.startTime, endTime: seg.words[seg.words.length - 1].endTime, originalText: seg.words.map(w => w.word).join(' '), editedText: seg.words.map(w => w.word).join(' '), isEdited: false });
          }
          seg = { words: [word], startTime: word.startTime };
        } else seg.words.push(word);
      }
      if (seg) newT.push({ id: `t_${Date.now()}_${newT.length}`, startTime: seg.startTime, endTime: seg.words[seg.words.length - 1].endTime, originalText: seg.words.map(w => w.word).join(' '), editedText: seg.words.map(w => w.word).join(' '), isEdited: false });

      // 트림된 클립 범위에 맞게 필터링 (잘라낸 부분 제외)
      const mappedT = filterResultsToClipRanges(newT);
      const finalT = mappedT.length > 0 ? mappedT : newT; // 클립이 없으면 원본 사용
      onTranscriptsUpdate?.([...transcripts, ...finalT]);

      // Auto-add to timeline (Dialogue -> Track 0)
      if (onAddSubtitleClips && finalT.length > 0) {
        onAddSubtitleClips(finalT, 0);
      }

      setTranscriptionStatus('완료!');
      setTimeout(() => { setIsTranscribing(false); setTranscriptionProgress(0); setTranscriptionStatus(''); }, 2000);
    } catch (error: any) {
      if (error.message === 'PAYMENT_REQUIRED') {
        setShowPaymentModal(true);
      } else if (error.name !== 'AbortError') {
        alert(`음성 인식 실패: ${error.message}`);
      }
      setIsTranscribing(false); setTranscriptionProgress(0); setTranscriptionStatus('');
    }
  }, [videoFile, transcripts, onTranscriptsUpdate, filterResultsToClipRanges]);

  const handleCancelTranscription = useCallback(() => {
    transcriptionAbortController.current?.abort();
    setIsTranscribing(false); setTranscriptionProgress(0); setTranscriptionStatus('');
  }, []);

  const handleCancelGemini = useCallback(() => {
    geminiAbortController.current?.abort();
    setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus('');
  }, []);

  // Gemini Audio-based subtitle generation (creative mode if transcripts exist)
  const handleGeminiAudioGenerate = useCallback(async () => {
    if (!videoFile) { alert('비디오 파일이 필요합니다.'); return; }

    geminiAbortController.current = new AbortController();
    setIsGeminiGenerating(true); setGeminiProgress(0); setGeminiStatus('시작...');

    // If transcripts exist, use creative mode (don't clear them)
    const hasTranscripts = transcripts.length > 0;
    if (!hasTranscripts) {
      onTranscriptsUpdate?.([]);
    }
    onSubtitlesUpdate?.([]);

    try {
      const options = hasTranscripts
        ? {
            mode: 'creative' as const,
            transcriptData: transcripts.map(t => ({
              startTime: t.startTime,
              endTime: t.endTime,
              text: t.editedText || t.originalText,
            })),
            duration: videoDuration,
          }
        : { duration: videoDuration };

      const rawResults = await generateSubtitlesFromAudio(videoFile, 'backend-proxy', (pct, msg) => {
        setGeminiProgress(pct);
        setGeminiStatus(msg);
      }, geminiAbortController.current.signal, options);

      // 트림된 클립 범위에 맞게 필터링 (잘라낸 구간 제외)
      const mappedResults = filterResultsToClipRanges(
        rawResults.map(r => ({ ...r, startTime: r.start_time, endTime: r.end_time }))
      );
      const results = mappedResults.length > 0
        ? mappedResults.map(r => ({ ...r, start_time: r.startTime, end_time: r.endTime }))
        : rawResults;

      // Separate by type with colors (supports both old "예능자막" and new "예능" formats)
      const entertainmentItems: TranscriptItem[] = [];
      const situationItems: TranscriptItem[] = [];
      const explanationItems: TranscriptItem[] = [];
      const contextItems: TranscriptItem[] = [];

      results.forEach((r, i) => {
        const base: TranscriptItem = {
          id: `gem_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          originalText: r.text,
          editedText: r.text,
          isEdited: false,
          color: '#FFFFFF',
          strokeColor: '#000000',
        };
        const st = r.style_type;
        if (st === '예능자막' || st === '예능') {
          entertainmentItems.push({ ...base, color: '#FFE066', strokeColor: '#FF6B6B' });
        } else if (st === '상황자막' || st === '상황') {
          situationItems.push({ ...base, color: '#A8E6CF' });
        } else if (st === '설명자막' || st === '설명') {
          explanationItems.push({ ...base, color: '#88D8FF', strokeColor: '#0066CC' });
        } else if (st === '맥락') {
          contextItems.push({ ...base, color: '#C9A0FF', strokeColor: '#6B21A8' });
        } else {
          situationItems.push({ ...base, color: '#A8E6CF' });
        }
      });

      const allNewT = [...entertainmentItems, ...situationItems, ...explanationItems, ...contextItems];
      // Remove transcript segments that overlap with AI subtitles
      const filteredTranscripts = hasTranscripts ? removeOverlappingTranscripts(transcripts, allNewT) : [];
      onTranscriptsUpdate?.([...filteredTranscripts, ...allNewT]);

      const newSubs: SubtitleItem[] = results.map((r, i) => {
        const st = r.style_type;
        const type = (st === '예능자막' || st === '예능') ? 'ENTERTAINMENT' as const
          : (st === '설명자막' || st === '설명') ? 'EXPLANATION' as const
          : st === '맥락' ? 'CONTEXT' as const
          : 'SITUATION' as const;
        return {
          id: `gemsub_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          text: r.text,
          type,
          confidence: 0.9,
        };
      });
      onSubtitlesUpdate?.(newSubs);
      setAiScript(results.map(r => `[${r.style_type}] ${r.text}`).join('\n'));

      // Add to timeline — all AI subtitles on single track 5 (replace existing)
      if (onAddSubtitleClips) {
        if (hasTranscripts && filteredTranscripts.length > 0) {
          onAddSubtitleClips(filteredTranscripts, 0, true);
        }
        const allAiItems = [...entertainmentItems, ...situationItems, ...explanationItems, ...contextItems]
          .sort((a, b) => a.startTime - b.startTime);
        if (allAiItems.length > 0) onAddSubtitleClips(allAiItems, 5, true);
      }

      setGeminiStatus('완료!');
      setTimeout(() => { setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus(''); }, 2000);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Ignored
      } else if (err.message === 'PAYMENT_REQUIRED') {
        setShowPaymentModal(true);
      } else {
        const is503 = err.message.includes('503') || err.message.toLowerCase().includes('high demand') || err.message.toLowerCase().includes('service unavailable');
        if (is503) {
          alert('현재 Gemini AI 서버에 사용자가 많아 잠시 서비스가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
        } else {
          alert(err.message || '자막 생성에 실패했습니다.');
        }
      }
      setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus('');
    }
  }, [videoFile, videoDuration, transcripts, subtitles, onTranscriptsUpdate, onSubtitlesUpdate, onAddSubtitleClips, filterResultsToClipRanges]);

  const filteredTranscripts = React.useMemo(() => {
    if (!searchQuery) return transcripts;
    return transcripts.filter(t => 
      (t.editedText || t.originalText).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [transcripts, searchQuery]);

  const activeTranscriptIndex = React.useMemo(() => {
    return transcripts.findIndex((t, i) => 
      currentTime >= t.startTime && currentTime < (transcripts[i + 1]?.startTime || Infinity)
    );
  }, [transcripts, currentTime]);

  // Integrated Generation (STT + Gemini)
  const handleIntegratedGenerate = useCallback(async () => {
    if (!videoFile) { alert('비디오 파일이 필요합니다.'); return; }

    setIsIntegratedGenerating(true);
    setIntegratedProgress(0);
    setIntegratedStatus('통합 분석 시작...');

    // Clear existing
    onTranscriptsUpdate?.([]);
    onSubtitlesUpdate?.([]);

    try {
      // Step 1: Execute STT (Dialogue)
      setIntegratedStatus('음성 분석 중...');
      const sttResult = await transcribeVideo(videoFile, 'backend-proxy', (status) => {
        setIntegratedStatus(`대본 생성 중: ${status}`);
        // Approximate STT to be 0-50% of the total progress
        if (status.includes('음성 인식')) {
          const m = status.match(/(\d+)\/(\d+)/);
          if (m) setIntegratedProgress(10 + (parseInt(m[1]) / parseInt(m[2])) * 30);
        }
      });

      const sttT: TranscriptItem[] = [];
      let seg: { words: typeof sttResult.words; startTime: number } | null = null;
      for (const word of sttResult.words) {
        if (!seg || word.startTime - seg.startTime >= 3) {
          if (seg) {
            sttT.push({ id: `stt_${Date.now()}_${sttT.length}`, startTime: seg.startTime, endTime: seg.words[seg.words.length - 1].endTime, originalText: seg.words.map(w => w.word).join(' '), editedText: seg.words.map(w => w.word).join(' '), isEdited: false });
          }
          seg = { words: [word], startTime: word.startTime };
        } else seg.words.push(word);
      }
      if (seg) sttT.push({ id: `stt_${Date.now()}_${sttT.length}`, startTime: seg.startTime, endTime: seg.words[seg.words.length - 1].endTime, originalText: seg.words.map(w => w.word).join(' '), editedText: seg.words.map(w => w.word).join(' '), isEdited: false });

      // 트림된 클립 범위에 맞게 STT 결과 필터링
      const mappedSttT = filterResultsToClipRanges(sttT);
      const filteredSttT_pre = mappedSttT.length > 0 ? mappedSttT : sttT;

      setIntegratedProgress(50);
      setIntegratedStatus('AI 연출 자막 생성 중...');

      // Step 2: Execute Gemini in "creative" mode — pass transcript so it won't duplicate
      const transcriptForAI: TranscriptDataForAI[] = filteredSttT_pre.map(t => ({
        startTime: t.startTime,
        endTime: t.endTime,
        text: t.editedText || t.originalText,
      }));

      const rawGeminiResults = await generateSubtitlesFromAudio(videoFile, 'backend-proxy', (pct, msg) => {
        setIntegratedStatus(`AI 연출 중: ${msg}`);
        setIntegratedProgress(50 + (pct * 0.5));
      }, undefined, { mode: 'creative', transcriptData: transcriptForAI, duration: videoDuration });

      // 트림된 클립 범위에 맞게 Gemini 결과 필터링
      const mappedGemini = filterResultsToClipRanges(
        rawGeminiResults.map(r => ({ ...r, startTime: r.start_time, endTime: r.end_time }))
      );
      const geminiResults = mappedGemini.length > 0
        ? mappedGemini.map(r => ({ ...r, start_time: r.startTime, end_time: r.endTime }))
        : rawGeminiResults;

      // Separate by style_type and assign colors + tracks (supports both old and new formats)
      const entertainmentItems: TranscriptItem[] = [];
      const situationItems: TranscriptItem[] = [];
      const explanationItems: TranscriptItem[] = [];
      const contextItems: TranscriptItem[] = [];

      geminiResults.forEach((r, i) => {
        const base: TranscriptItem = {
          id: `intgem_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          originalText: r.text,
          editedText: r.text,
          isEdited: false,
          color: '#FFFFFF',
          strokeColor: '#000000',
        };
        const st = r.style_type;
        if (st === '예능자막' || st === '예능') {
          entertainmentItems.push({ ...base, color: '#FFE066', strokeColor: '#FF6B6B' });
        } else if (st === '상황자막' || st === '상황') {
          situationItems.push({ ...base, color: '#A8E6CF' });
        } else if (st === '설명자막' || st === '설명') {
          explanationItems.push({ ...base, color: '#88D8FF', strokeColor: '#0066CC' });
        } else if (st === '맥락') {
          contextItems.push({ ...base, color: '#C9A0FF', strokeColor: '#6B21A8' });
        } else {
          situationItems.push({ ...base, color: '#A8E6CF' });
        }
      });

      const allGeminiT = [...entertainmentItems, ...situationItems, ...explanationItems, ...contextItems];

      // Remove transcript segments that overlap with AI subtitles
      const filteredSttT = removeOverlappingTranscripts(filteredSttT_pre, allGeminiT);

      const geminiSubs: SubtitleItem[] = geminiResults.map((r, i) => {
        const st = r.style_type;
        const type = (st === '예능자막' || st === '예능') ? 'ENTERTAINMENT' as const
          : (st === '설명자막' || st === '설명') ? 'EXPLANATION' as const
          : st === '맥락' ? 'CONTEXT' as const
          : 'SITUATION' as const;
        return {
          id: `intsub_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          text: r.text,
          type,
          confidence: 0.9,
        };
      });

      // Combine and update
      onTranscriptsUpdate?.([...filteredSttT, ...allGeminiT]);
      onSubtitlesUpdate?.(geminiSubs);

      // Add to timeline — all AI subtitles on single track 5 (replace existing)
      if (onAddSubtitleClips) {
        onAddSubtitleClips(filteredSttT, 0, true);                                     // Track 0: 대본 (replace)
        const allAiItems = [...entertainmentItems, ...situationItems, ...explanationItems, ...contextItems]
          .sort((a, b) => a.startTime - b.startTime);
        if (allAiItems.length > 0) onAddSubtitleClips(allAiItems, 5, true);
      }

      setIntegratedStatus('모든 자막 생성 완료!');
      setIntegratedProgress(100);
      setTimeout(() => {
        setIsIntegratedGenerating(false);
        setIntegratedProgress(0);
        setIntegratedStatus('');
      }, 2000);

    } catch (err: any) {
      if (err.message === 'PAYMENT_REQUIRED') setShowPaymentModal(true);
      else alert(err.message || '통합 자막 생성 실패');
      setIsIntegratedGenerating(false);
      setIntegratedProgress(0);
      setIntegratedStatus('');
    }
  }, [videoFile, videoDuration, onTranscriptsUpdate, onSubtitlesUpdate, onAddSubtitleClips, filterResultsToClipRanges]);

  // Auto Pipeline feature removed so STT does not run automatically on video load

  // Preset click handler — applies style to clips
  const handlePresetClick = (preset: SubtitlePreset) => {
    setSelectedPresetId(preset.id);

    const styleUpdate: Partial<VideoClip> = {
      color: preset.color,
      backgroundColor: preset.backgroundColor,
      strokeColor: preset.strokeColor,
      strokeWidth: preset.strokeWidth,
      shadowColor: preset.shadowColor,
      shadowBlur: preset.shadowBlur,
      shadowOffsetX: preset.shadowOffsetX,
      shadowOffsetY: preset.shadowOffsetY,
      glowColor: preset.glowColor,
      borderColor: preset.borderColor,
      borderWidth: preset.borderWidth,
      fontWeight: preset.fontWeight,
      fontFamily: preset.fontFamily,
      fontStyle: preset.fontStyle,
      textDecoration: preset.textDecoration,
    };

    const selectedSubtitleClips = clips.filter(c => selectedClipIds.includes(c.id));

    if (selectedSubtitleClips.length > 0 && onClipsBatchUpdate) {
      if (applyToAllOnTrack) {
        const trackIndices = new Set(selectedSubtitleClips.map(c => c.trackIndex));
        const targetIds = clips.filter(c => trackIndices.has(c.trackIndex)).map(c => c.id);
        onClipsBatchUpdate(targetIds, styleUpdate);
      } else {
        onClipsBatchUpdate(selectedSubtitleClips.map(c => c.id), styleUpdate);
      }
    } else if (selectedSubtitleClips.length > 0 && onClipUpdate) {
      // Fallback to individual updates
      selectedSubtitleClips.forEach(clip => {
        onClipUpdate(clip.id, styleUpdate);
      });
    }
  };

  // Drag start for preset swatch → store preset data
  const handlePresetDragStart = (e: React.DragEvent, preset: SubtitlePreset) => {
    e.dataTransfer.setData('application/subtitle-preset', JSON.stringify(preset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleTranscriptDragStart = (e: React.DragEvent, text: string) => {
    e.dataTransfer.setData('application/subtitle-item', JSON.stringify({ text }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="w-full h-full bg-panel-bg border-l border-border-color flex flex-col overflow-hidden">


      {/* Tabs */}
      <div className="flex border-b border-border-color">
        {[
          { id: 'details' as const, icon: 'movie', tip: 'Video' },
          { id: 'caption' as const, icon: 'subtitles', tip: 'Caption' },
          { id: 'export' as const, icon: 'file_download', tip: 'Export' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} title={tab.tip}
            className={`flex-1 py-2 flex items-center justify-center transition-all relative group ${activeTab === tab.id ? 'text-white border-b-2 border-primary bg-white/5' : 'text-text-secondary hover:text-white hover:bg-white/5'
              } active:scale-95`}>
            <span className="material-icons text-lg">{tab.icon}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ===== CAPTION TAB ===== */}
        {activeTab === 'caption' && (
          <div className="flex flex-col h-full">
            <div className="flex border-b border-border-color bg-editor-bg">
              {[
                { id: 'caption' as const, icon: 'subtitles' },
                { id: 'text' as const, icon: 'title' },
                { id: 'animation' as const, icon: 'animation' },
                { id: 'tracking' as const, icon: 'track_changes' },
                { id: 'tts' as const, icon: 'volume_up' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setCaptionTab(tab.id)}
                  className={`flex-1 py-1.5 text-[10px] font-medium transition-all ${captionTab === tab.id ? 'text-primary border-b-2 border-primary bg-white/5' : 'text-text-secondary hover:text-white hover:bg-white/5'} active:scale-95`}>
                  <span className="material-icons text-xs">{tab.icon}</span>
                </button>
              ))}
            </div>

            {/* Caption content */}
            {captionTab === 'caption' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="p-2 border-b border-border-color space-y-2">
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary text-xs">search</span>
                      <input type="text" placeholder="검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-7 pr-2 py-1.5 bg-black/30 border border-border-color rounded text-xs text-white placeholder-text-secondary focus:outline-none focus:border-primary" />
                    </div>
                    <button onClick={() => setShowReplace(!showReplace)} title="찾기 및 바꾸기"
                      className={`p-1.5 rounded text-xs ${showReplace ? 'bg-primary text-white' : 'bg-black/30 text-text-secondary hover:text-white'}`}>
                      <span className="material-icons text-xs">find_replace</span>
                    </button>
                  </div>
                  {showReplace && searchQuery && (
                    <div className="flex items-center gap-1">
                      <input type="text" placeholder="변환할 텍스트" value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-black/30 border border-border-color rounded text-xs text-white placeholder-text-secondary focus:outline-none focus:border-primary" />
                      <button onClick={() => {
                        if (!searchQuery || !replaceQuery) return;
                        const updated = transcripts.map(t => {
                          const text = t.editedText || t.originalText;
                          if (!text.includes(searchQuery)) return t;
                          return { ...t, editedText: text.replaceAll(searchQuery, replaceQuery), originalText: t.originalText };
                        });
                        onTranscriptsUpdate?.(updated);
                        // Also update matching clips
                        if (clips && onClipUpdate) {
                          clips.forEach(c => {
                            if (c.name.includes(searchQuery)) {
                              onClipUpdate(c.id, { name: c.name.replaceAll(searchQuery, replaceQuery) });
                            }
                          });
                        }
                      }} className="px-2 py-1.5 bg-primary hover:bg-primary/80 text-white rounded text-xs whitespace-nowrap">
                        전체 변환
                      </button>
                    </div>
                  )}
                  {/* SRT/ASS Import (hidden, triggered from LeftSidebar import button) */}
                  <input ref={subtitleFileRef} type="file" accept=".srt,.ass,.ssa" className="hidden" onChange={handleSubtitleFileImport} />
                </div>
                <div className="flex-1 flex flex-col min-h-0 relative">
                {!videoFile ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 pt-12">
                    <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center">
                      <span className="material-icons text-3xl text-gray-600">movie_filter</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-400">영상을 먼저 추가해주세요</p>
                      <p className="text-[11px] text-gray-500">대본을 생성하거나 분석하려면<br />편집할 영상 파일이 필요합니다.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 custom-scrollbar">
                      {filteredTranscripts.map((t, i) => (
                        <TranscriptItem
                          key={t.id}
                          t={t}
                          isActive={activeTranscriptIndex === i}
                          isSelected={selectedTranscriptId === t.id}
                          onSelect={handleTranscriptSelect}
                          onEdit={handleTranscriptEdit}
                          onDragStart={handleTranscriptDragStart}
                          onMergeWithPrevious={handleMergeWithPrevious}
                          onSplitAtCursor={handleSplitAtCursor}
                        />
                      ))}
                      {filteredTranscripts.length === 0 && <div className="text-center py-12 text-text-secondary text-xs opacity-50">{searchQuery ? '검색 결과 없음' : '대본을 생성하거나 불러와주세요'}</div>}
                    </div>
                    <div className="border-t border-border-color flex flex-col" style={{ height: '40%' }}>
                      <div className="p-2 border-b border-border-color bg-panel-bg space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold">대본 Settings</h3>
                        </div>

                        {/* Master Integrated AI Button */}
                        <button onClick={handleIntegratedGenerate} disabled={isIntegratedGenerating || isTranscribing || isGeminiGenerating || !videoFile}
                          className={`w-full flex flex-col items-center justify-center p-3 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg relative overflow-hidden group ${isIntegratedGenerating || !videoFile
                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white hover:shadow-purple-500/40 hover:brightness-110'
                            }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`material-icons text-base ${isIntegratedGenerating ? 'animate-spin' : 'animate-pulse'}`}>auto_awesome</span>
                            <span>통합 AI 자막 마스터</span>
                          </div>
                          <span className="text-[9px] font-normal opacity-80">대본 + AI 연출 자막을 한번에 생성</span>
                        </button>

                        {isIntegratedGenerating && (
                          <div className="space-y-1.5 px-1 py-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-primary font-medium">{integratedStatus}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-white font-mono">{Math.round(integratedProgress)}%</span>
                                <button onClick={() => { handleCancelTranscription(); handleCancelGemini(); setIsIntegratedGenerating(false); setIntegratedProgress(0); setIntegratedStatus(''); }}
                                  className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-[9px] font-semibold hover:bg-red-500/30 active:scale-95">
                                  취소
                                </button>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden border border-white/5">
                              <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" style={{ width: `${integratedProgress}%` }} />
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          {/* Button 1: 자막대본 자동생성 */}
                          {isTranscribing ? (
                            <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] bg-gray-700 shadow-none">
                              <span className="material-icons text-[12px] animate-spin text-blue-400">refresh</span>
                              <span className="text-white font-mono">{Math.round(transcriptionProgress)}%</span>
                              <button onClick={handleCancelTranscription} className="ml-1 px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-[9px] font-semibold hover:bg-red-500/30 active:scale-95">취소</button>
                            </div>
                          ) : (
                            <button onClick={handleAutoTranscribe} disabled={isIntegratedGenerating || !videoFile}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 shadow-md ${isIntegratedGenerating || !videoFile
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                                : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-blue-500/50'
                                }`}>
                              <span className="text-sm">🎤</span>대본
                            </button>
                          )}

                          {/* Button 2: Gemini AI 자막생성 */}
                          {isGeminiGenerating ? (
                            <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] bg-gray-700 shadow-none">
                              <span className="material-icons text-[12px] animate-spin text-cyan-400">refresh</span>
                              <span className="text-white font-mono">{Math.round(geminiProgress)}%</span>
                              <button onClick={handleCancelGemini} className="ml-1 px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-[9px] font-semibold hover:bg-red-500/30 active:scale-95">취소</button>
                            </div>
                          ) : (
                            <button onClick={handleGeminiAudioGenerate} disabled={isIntegratedGenerating || !videoFile}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 shadow-md ${isIntegratedGenerating || !videoFile
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                                : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-cyan-500/50'
                                }`}>
                              <span className="text-sm">🤖</span>AI 연출
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col border-b border-border-color" style={{ height: '50%' }}>
                        <div className="px-2 py-1 bg-panel-bg border-b border-border-color"><h4 className="text-[10px] font-medium text-text-secondary">내 대본</h4></div>
                        <textarea ref={scriptTextareaRef} value={userScript} onChange={(e) => setUserScript(e.target.value)} placeholder="대본을 입력하세요..."
                          className="flex-1 p-2 bg-transparent text-xs text-white placeholder-text-secondary resize-none focus:outline-none" />
                      </div>
                      <div className="flex-1 flex flex-col" style={{ height: '50%' }}>
                        <div className="px-2 py-1 bg-panel-bg border-b border-border-color">
                          <h4 className="text-[10px] font-medium text-text-secondary flex items-center gap-1">
                            <span className="material-icons text-xs text-primary">auto_awesome</span>AI 생성 대본
                          </h4>
                        </div>
                        <div className="flex-1 p-0 flex flex-col overflow-hidden">
                          {aiScript ? (
                            <textarea
                              value={aiScript}
                              onChange={(e) => setAiScript(e.target.value)}
                              className="flex-1 p-2 bg-transparent text-xs text-white placeholder-text-secondary resize-none focus:outline-none"
                            />
                          ) : (
                            <div className="text-text-secondary text-[10px] text-center p-4">AI 자막 생성 버튼을 눌러주세요</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

            {/* ===== TEXT TAB: Font Style Presets + Font Controls ===== */}
            {captionTab === 'text' && (
              <div className="p-3 space-y-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white">자막 스타일</h3>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={applyToAllOnTrack} onChange={(e) => setApplyToAllOnTrack(e.target.checked)}
                      className="w-3 h-3 rounded accent-primary cursor-pointer" />
                    <span className="text-[10px] text-gray-400">모두적용</span>
                  </label>
                </div>

                {/* 자막 텍스트 편집 */}
                {selectedClip && !selectedClip.url && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400">자막 텍스트</label>
                    <textarea
                      value={selectedClip.name || ''}
                      onChange={(e) => onClipUpdate?.(selectedClip.id, { name: e.target.value })}
                      className="w-full bg-black/50 border border-border-color rounded-md text-xs text-white px-2 py-1.5 resize-none focus:outline-none focus:border-primary"
                      rows={2}
                      placeholder="자막을 입력하세요..."
                    />
                  </div>
                )}

                {/* ── 폰트 커스터마이징 ── */}
                <div className="space-y-2 bg-white/5 rounded-lg p-2.5">
                  <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">폰트 설정</h4>

                  {/* 서체 */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400">서체</label>
                    <select
                      value={selectedClip?.fontFamily || 'PaperlogyExtraBold'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                          const ids = applyToAllOnTrack
                            ? clips.filter(c => { const sc = clips.filter(cc => selectedClipIds.includes(cc.id)); return sc.some(s => s.trackIndex === c.trackIndex); }).map(c => c.id)
                            : selectedClipIds;
                          onClipsBatchUpdate(ids, { fontFamily: val });
                        } else if (selectedClip) onClipUpdate?.(selectedClip.id, { fontFamily: val });
                      }}
                      className="w-full bg-black/60 border border-gray-700 rounded text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary appearance-none cursor-pointer"
                    >
                      {FONT_FAMILIES.map(f => (
                        <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* 색깔 + 배경색 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">글자색</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={selectedClip?.color || '#FFFFFF'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { color: val });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { color: val });
                          }}
                          className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent p-0"
                        />
                        <span className="text-[10px] text-gray-500 font-mono">{selectedClip?.color || '#FFF'}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">배경색</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={selectedClip?.backgroundColor && selectedClip.backgroundColor !== 'transparent' ? selectedClip.backgroundColor : '#000000'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { backgroundColor: val });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { backgroundColor: val });
                          }}
                          className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent p-0"
                        />
                        <button
                          onClick={() => {
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { backgroundColor: 'transparent' });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { backgroundColor: 'transparent' });
                          }}
                          className="text-[9px] text-gray-500 hover:text-white transition-colors"
                          title="배경 투명"
                        >투명</button>
                      </div>
                    </div>
                  </div>

                  {/* 외곽선색 + 두께 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">외곽선</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={selectedClip?.strokeColor && selectedClip.strokeColor !== 'transparent' ? selectedClip.strokeColor : '#000000'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { strokeColor: val, strokeWidth: Math.max(selectedClip?.strokeWidth || 0, 1) });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { strokeColor: val, strokeWidth: Math.max(selectedClip.strokeWidth || 0, 1) });
                          }}
                          className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent p-0"
                        />
                        <input type="range" min="0" max="6" step="0.5" value={selectedClip?.strokeWidth || 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { strokeWidth: val });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { strokeWidth: val });
                          }}
                          className="flex-1 h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">굵기</label>
                      <select
                        value={selectedClip?.fontWeight || 400}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                            const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                            onClipsBatchUpdate(ids, { fontWeight: val });
                          } else if (selectedClip) onClipUpdate?.(selectedClip.id, { fontWeight: val });
                        }}
                        className="w-full bg-black/60 border border-gray-700 rounded text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value={300}>Light (300)</option>
                        <option value={400}>Regular (400)</option>
                        <option value={500}>Medium (500)</option>
                        <option value={600}>SemiBold (600)</option>
                        <option value={700}>Bold (700)</option>
                        <option value={800}>ExtraBold (800)</option>
                        <option value={900}>Black (900)</option>
                      </select>
                    </div>
                  </div>

                  {/* 기울이기 + 밑줄 토글 */}
                  <div className="flex gap-1.5">
                    {(() => {
                      const applyStyle = (updates: Partial<VideoClip>) => {
                        if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                          const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                          onClipsBatchUpdate(ids, updates);
                        } else if (selectedClip) onClipUpdate?.(selectedClip.id, updates);
                      };
                      const isItalic = selectedClip?.fontStyle === 'italic';
                      const isUnderline = selectedClip?.textDecoration === 'underline';
                      return (<>
                        <button
                          onClick={() => applyStyle({ fontStyle: isItalic ? 'normal' : 'italic' })}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-xs font-medium transition-all ${isItalic ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-black/40 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
                        >
                          <span className="italic font-serif text-sm">I</span>
                          <span className="text-[10px]">기울임</span>
                        </button>
                        <button
                          onClick={() => applyStyle({ textDecoration: isUnderline ? 'none' : 'underline' })}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-xs font-medium transition-all ${isUnderline ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-black/40 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
                        >
                          <span className="underline text-sm">U</span>
                          <span className="text-[10px]">밑줄</span>
                        </button>
                      </>);
                    })()}
                  </div>

                  {/* 크기 */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400">크기 ({selectedClip?.fontSize || 48}px)</label>
                    <input type="range" min="12" max="120" step="1" value={selectedClip?.fontSize || 48}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                          const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                          onClipsBatchUpdate(ids, { fontSize: val });
                        } else if (selectedClip) onClipUpdate?.(selectedClip.id, { fontSize: val });
                      }}
                      className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  {/* 줄간격 / 자간 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">줄간격 ({((selectedClip?.lineHeight ?? 1.3) * 10 | 0) / 10})</label>
                      <input type="range" min="0.5" max="3.0" step="0.05"
                        value={selectedClip?.lineHeight ?? 1.3}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                            const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                            onClipsBatchUpdate(ids, { lineHeight: val });
                          } else if (selectedClip) onClipUpdate?.(selectedClip.id, { lineHeight: val });
                        }}
                        className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">자간 ({((selectedClip?.letterSpacing ?? 0) * 100 | 0) / 100}em)</label>
                      <input type="range" min="-0.1" max="0.5" step="0.01"
                        value={selectedClip?.letterSpacing ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                            const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                            onClipsBatchUpdate(ids, { letterSpacing: val });
                          } else if (selectedClip) onClipUpdate?.(selectedClip.id, { letterSpacing: val });
                        }}
                        className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* ── 프리셋 목록 ── */}
                <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider pt-1">기본 프리셋</h4>
                <div className="grid grid-cols-4 gap-2">
                  {SUBTITLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      draggable={preset.id !== 0}
                      onDragStart={(e) => handlePresetDragStart(e, preset)}
                      onClick={() => handlePresetClick(preset)}
                      title={preset.name}
                      className={`relative rounded-lg border-2 flex items-center justify-center overflow-hidden transition-all active:scale-90 cursor-grab active:cursor-grabbing ${selectedPresetId === preset.id ? 'border-primary ring-2 ring-primary scale-105' : 'border-gray-700 hover:border-gray-500'
                        }`}
                      style={{
                        minHeight: '50px',
                        backgroundColor: preset.backgroundColor === 'transparent' ? '#1a1a2e' : preset.backgroundColor,
                        ...(preset.borderColor && selectedPresetId !== preset.id ? { borderColor: preset.borderColor } : {}),
                      }}
                    >
                      {preset.id === 0 ? (
                        <span className="material-icons text-gray-500 text-lg">close</span>
                      ) : (
                        <span style={{
                          fontSize: '20px',
                          fontWeight: preset.fontWeight || 700,
                          fontFamily: preset.fontFamily || 'sans-serif',
                          fontStyle: preset.fontStyle || 'normal',
                          textDecoration: preset.textDecoration || 'none',
                          color: preset.color,
                          textShadow: preset.glowColor
                            ? `0 0 ${preset.shadowBlur}px ${preset.glowColor}, 0 0 ${preset.shadowBlur * 2}px ${preset.glowColor}`
                            : preset.shadowBlur > 0
                              ? `${preset.shadowOffsetX}px ${preset.shadowOffsetY}px ${preset.shadowBlur}px ${preset.shadowColor}`
                              : 'none',
                          WebkitTextStroke: preset.strokeWidth > 0 ? `${Math.min(preset.strokeWidth, 2)}px ${preset.strokeColor}` : 'none',
                          lineHeight: 1,
                        }}>
                          Aa
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* ── 커스텀 프리셋 ── */}
                <div className="flex items-center justify-between pt-1">
                  <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">나만의 프리셋</h4>
                  <button
                    onClick={() => setShowSavePreset(!showSavePreset)}
                    className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                  >
                    <span className="material-icons text-xs">add_circle</span>
                    저장
                  </button>
                </div>

                {/* 프리셋 저장 UI */}
                {showSavePreset && selectedClip && (
                  <div className="bg-black/40 border border-primary/30 rounded-lg p-2.5 space-y-2">
                    <p className="text-[10px] text-gray-400">현재 선택한 클립의 스타일을 프리셋으로 저장합니다</p>
                    <input
                      type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="프리셋 이름"
                      className="w-full bg-black/60 border border-gray-700 rounded text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!newPresetName.trim()) return;
                          const updated = addCustomPreset({
                            name: newPresetName.trim(),
                            color: selectedClip.color || '#FFFFFF',
                            backgroundColor: selectedClip.backgroundColor || 'transparent',
                            strokeColor: selectedClip.strokeColor || 'transparent',
                            strokeWidth: selectedClip.strokeWidth || 0,
                            shadowColor: selectedClip.shadowColor || 'transparent',
                            shadowBlur: selectedClip.shadowBlur || 0,
                            shadowOffsetX: selectedClip.shadowOffsetX || 0,
                            shadowOffsetY: selectedClip.shadowOffsetY || 0,
                            glowColor: selectedClip.glowColor,
                            borderColor: selectedClip.borderColor,
                            borderWidth: selectedClip.borderWidth,
                            fontWeight: selectedClip.fontWeight,
                            fontFamily: selectedClip.fontFamily,
                            fontStyle: selectedClip.fontStyle,
                            textDecoration: selectedClip.textDecoration,
                          });
                          setCustomPresets(updated);
                          setNewPresetName('');
                          setShowSavePreset(false);
                        }}
                        className="flex-1 py-1.5 rounded text-xs font-semibold bg-primary/20 text-primary hover:bg-primary/30 transition-all"
                      >저장</button>
                      <button onClick={() => { setShowSavePreset(false); setNewPresetName(''); }}
                        className="flex-1 py-1.5 rounded text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                      >취소</button>
                    </div>
                  </div>
                )}

                {customPresets.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {customPresets.map((preset) => (
                      <div key={preset.id} className="relative group">
                        <button
                          draggable
                          onDragStart={(e) => handlePresetDragStart(e, preset)}
                          onClick={() => handlePresetClick(preset)}
                          title={preset.name}
                          className={`w-full rounded-lg border-2 flex items-center justify-center overflow-hidden transition-all active:scale-90 cursor-grab ${selectedPresetId === preset.id ? 'border-primary ring-2 ring-primary scale-105' : 'border-gray-700 hover:border-gray-500'}`}
                          style={{
                            minHeight: '50px',
                            backgroundColor: preset.backgroundColor === 'transparent' ? '#1a1a2e' : preset.backgroundColor,
                          }}
                        >
                          <span style={{
                            fontSize: '20px',
                            fontWeight: preset.fontWeight || 700,
                            fontFamily: preset.fontFamily || 'sans-serif',
                            fontStyle: preset.fontStyle || 'normal',
                            textDecoration: preset.textDecoration || 'none',
                            color: preset.color,
                            textShadow: preset.glowColor
                              ? `0 0 ${preset.shadowBlur}px ${preset.glowColor}, 0 0 ${preset.shadowBlur * 2}px ${preset.glowColor}`
                              : preset.shadowBlur > 0
                                ? `${preset.shadowOffsetX}px ${preset.shadowOffsetY}px ${preset.shadowBlur}px ${preset.shadowColor}`
                                : 'none',
                            WebkitTextStroke: preset.strokeWidth > 0 ? `${Math.min(preset.strokeWidth, 2)}px ${preset.strokeColor}` : 'none',
                            lineHeight: 1,
                          }}>
                            Aa
                          </span>
                        </button>
                        {/* 삭제 버튼 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setCustomPresets(deleteCustomPreset(preset.id)); }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="삭제"
                        >
                          <span className="material-icons text-white" style={{ fontSize: '10px' }}>close</span>
                        </button>
                        <p className="text-[8px] text-gray-500 text-center truncate mt-0.5">{preset.name}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-600 text-center py-2">저장된 커스텀 프리셋이 없습니다</p>
                )}

                <button
                  onClick={() => {
                    const allPresets = [...SUBTITLE_PRESETS, ...customPresets];
                    const preset = allPresets.find(p => p.id === (selectedPresetId || 1)) || SUBTITLE_PRESETS[1];
                    if (preset && onAddTextClip) onAddTextClip(preset);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-all active:scale-95"
                >
                  <span className="material-icons text-sm">add</span>
                  새 자막 추가
                </button>
              </div>
            )}

            {captionTab === 'animation' && (
              <SubtitleAnimationPanel
                selectedSubtitle={
                  subtitles?.find(s =>
                    currentTime !== undefined &&
                    s.startTime <= currentTime && s.endTime >= currentTime
                  ) ?? null
                }
                isPro={false}
                onUpdate={(id, animation: SubtitleAnimation) => {
                  // 1. SubtitleItem 상태 업데이트
                  if (subtitles && onSubtitlesUpdate) {
                    onSubtitlesUpdate(subtitles.map(s =>
                      s.id === id ? { ...s, animation } : s
                    ));
                  }
                  // 2. 타임라인의 VideoClip도 업데이트 (Player에서 CSS 클래스 적용용)
                  if (onClipUpdate && clips) {
                    const targetSubtitle = subtitles?.find(s => s.id === id);
                    if (targetSubtitle) {
                      // 해당 자막 시간대에 있는 자막 클립 찾기
                      const subtitleClip = clips.find(c =>
                        (c.trackIndex === 0 || (c.trackIndex >= 5 && c.trackIndex <= 8)) &&
                        Math.abs(c.startTime - targetSubtitle.startTime) < 0.1
                      );
                      if (subtitleClip) {
                        onClipUpdate(subtitleClip.id, {
                          subtitleAnimationPreset: animation.inPreset,
                          subtitleOutPreset: animation.outPreset,
                          subtitleAnimationDuration: animation.duration,
                        });
                      }
                    }
                  }
                }}
                onUpgradeClick={() => setShowPaymentModal(true)}
              />
            )}
            {captionTab === 'tracking' && <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">트래킹 설정</div>}

            {/* ── AI 사운드 효과 탭 ── */}
            {captionTab === 'tts' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-4">

                {/* ── 섹션 1: AI 음성 (TTS) ── */}
                <div className="rounded-xl bg-gradient-to-br from-blue-900/40 to-cyan-900/30 border border-blue-500/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-blue-400 text-base">volume_up</span>
                    <span className="text-xs font-semibold text-blue-300">AI 음성 생성 (TTS)</span>
                  </div>

                  {/* 텍스트 입력 — 선택된 자막 자동 채움 */}
                  <textarea
                    value={ttsText}
                    onChange={e => setTtsText(e.target.value)}
                    placeholder={selectedClip?.trackIndex === 0 || (selectedClip?.trackIndex ?? -1) >= 5
                      ? selectedClip?.name || '자막 텍스트를 입력하세요...'
                      : '읽어줄 텍스트를 입력하세요...'}
                    rows={3}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-400/50 resize-none mb-2"
                  />

                  {/* 선택된 자막 → 자동 입력 버튼 */}
                  {selectedClip && (selectedClip.trackIndex === 0 || selectedClip.trackIndex >= 5) && selectedClip.name && (
                    <button
                      onClick={() => setTtsText(selectedClip.name)}
                      className="w-full mb-2 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] hover:bg-blue-500/20 transition-all flex items-center justify-center gap-1"
                    >
                      <span className="material-icons text-[12px]">auto_fix_high</span>
                      선택된 자막 텍스트 불러오기
                    </button>
                  )}

                  {/* 음성 선택 */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {([
                      { id: 'nova', label: 'Nova', desc: '밝고 친근' },
                      { id: 'alloy', label: 'Alloy', desc: '중성적' },
                      { id: 'echo', label: 'Echo', desc: '남성적' },
                      { id: 'fable', label: 'Fable', desc: '스토리텔링' },
                      { id: 'onyx', label: 'Onyx', desc: '깊고 낮음' },
                      { id: 'shimmer', label: 'Shimmer', desc: '여성적' },
                    ] as const).map(v => (
                      <button
                        key={v.id}
                        onClick={() => setTtsVoice(v.id)}
                        className={`px-1.5 py-1.5 rounded-lg border text-center transition-all ${ttsVoice === v.id ? 'bg-blue-500/30 border-blue-400/60 text-blue-200' : 'bg-white/5 border-white/10 text-text-secondary hover:border-blue-400/30 hover:text-white'}`}
                      >
                        <div className="text-[10px] font-semibold">{v.label}</div>
                        <div className="text-[8px] opacity-60">{v.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* 속도 */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] text-text-secondary w-8">속도</span>
                    <input
                      type="range" min="0.25" max="4" step="0.25"
                      value={ttsSpeed}
                      onChange={e => setTtsSpeed(Number(e.target.value))}
                      className="flex-1 h-1 accent-blue-400 cursor-pointer"
                    />
                    <span className="text-[10px] text-blue-300 w-8 text-right">{ttsSpeed}x</span>
                  </div>

                  {/* 생성 버튼 */}
                  <button
                    disabled={!ttsText.trim() || isGeneratingTts}
                    onClick={async () => {
                      if (!ttsText.trim()) return;
                      setIsGeneratingTts(true);
                      setTtsStatus('음성 생성 중...');
                      setTtsAudioUrl(null);
                      try {
                        const res = await fetch('/api/ai/tts', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text: ttsText, voice: ttsVoice, speed: ttsSpeed }),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          setTtsStatus(`실패: ${err.error || '알 수 없는 오류'}`);
                          return;
                        }
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        setTtsAudioUrl(url);
                        setTtsStatus('생성 완료! 아래에서 재생하세요.');
                      } catch {
                        setTtsStatus('네트워크 오류');
                      } finally {
                        setIsGeneratingTts(false);
                      }
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${!ttsText.trim() || isGeneratingTts ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-900/30 active:scale-95'}`}
                  >
                    {isGeneratingTts ? (
                      <><span className="material-icons text-base animate-spin">refresh</span>음성 생성 중...</>
                    ) : (
                      <><span className="material-icons text-base">volume_up</span>AI 음성 생성</>
                    )}
                  </button>

                  {/* 생성된 오디오 플레이어 */}
                  {ttsAudioUrl && (
                    <div className="mt-3 space-y-2">
                      <div className="text-[10px] text-blue-300 flex items-center gap-1">
                        <span className="material-icons text-[12px]">check_circle</span>
                        {ttsStatus}
                      </div>
                      <audio
                        ref={ttsAudioRef}
                        src={ttsAudioUrl}
                        controls
                        className="w-full h-8"
                        style={{ filter: 'invert(0.9) hue-rotate(180deg)', transform: 'scale(0.95)' }}
                      />
                      <a
                        href={ttsAudioUrl}
                        download={`tts-${ttsVoice}-${Date.now()}.mp3`}
                        className="w-full py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] hover:bg-blue-500/30 transition-all flex items-center justify-center gap-1"
                      >
                        <span className="material-icons text-[12px]">download</span>
                        MP3 다운로드
                      </a>
                    </div>
                  )}

                  {ttsStatus && !isGeneratingTts && !ttsAudioUrl && (
                    <div className="mt-2 text-center text-[10px] text-red-400">{ttsStatus}</div>
                  )}
                </div>

                {/* ── 섹션 2: 사운드 효과 제안 ── */}
                <div className="rounded-xl bg-gradient-to-br from-purple-900/40 to-blue-900/30 border border-purple-500/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-purple-400 text-base">music_note</span>
                    <span className="text-xs font-semibold text-purple-300">사운드 효과 제안</span>
                  </div>

                  {/* 자막에서 상황 묘사 자동 감지 */}
                  {(() => {
                    const situationClips = (clips || []).filter(c =>
                      (c.trackIndex === 5 || c.trackIndex === 0) &&
                      (c.name.includes('[') || c.name.includes('♪') || c.name.includes('♬') || c.name.includes('BGM') || c.name.includes('효과음'))
                    );
                    if (situationClips.length === 0) return null;
                    return (
                      <div className="mb-2">
                        <div className="text-[10px] text-text-secondary mb-1.5 flex items-center gap-1">
                          <span className="material-icons text-[11px]">auto_awesome</span>감지된 상황 묘사
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {situationClips.slice(0, 6).map(c => (
                            <button key={c.id}
                              onClick={() => { setSoundPrompt(c.name.replace(/[\[\]♪♬]/g, '').trim()); setTtsText(c.name.replace(/[\[\]♪♬🎵]/g, '').trim()); }}
                              className="w-full text-left px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-purple-500/10 hover:border-purple-500/30 transition-all text-[10px] text-text-secondary hover:text-white"
                            >
                              <span className="text-purple-400 mr-1">♪</span>{c.name}
                              <span className="ml-1 text-[9px] text-gray-600">({c.startTime.toFixed(1)}s)</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 빠른 선택 칩 */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {['긴장감 BGM', '웃음 소리', '박수', '두둥!', '적막', '심장 박동', '슬픈 피아노', '신나는 BGM'].map(s => (
                      <button key={s} onClick={() => { setSoundPrompt(s); setTtsText(s); }}
                        className={`px-2 py-0.5 rounded-full border text-[10px] transition-all ${soundPrompt === s ? 'bg-purple-500/30 border-purple-400/60 text-purple-300' : 'bg-white/5 border-white/10 text-text-secondary hover:border-purple-400/40 hover:text-white'}`}>
                        {s}
                      </button>
                    ))}
                  </div>

                  <textarea value={soundPrompt} onChange={e => setSoundPrompt(e.target.value)}
                    placeholder="사운드 설명 입력 (예: 긴장감 폭발 BGM, 웃음 소리...)"
                    rows={2}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-400/50 resize-none mb-2"
                  />

                  <button disabled={!soundPrompt.trim() || isGeneratingSound}
                    onClick={async () => {
                      if (!soundPrompt.trim()) return;
                      setIsGeneratingSound(true); setSoundGenStatus('분석 중...'); setSoundSuggestions([]);
                      try {
                        const res = await fetch('/api/ai/sound-suggest', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: soundPrompt, clips: (clips || []).filter(c => c.trackIndex === 5 || c.trackIndex === 0).map(c => ({ name: c.name, startTime: c.startTime, duration: c.duration })) }),
                        });
                        if (res.ok) { const d = await res.json(); setSoundSuggestions(d.suggestions || []); setSoundGenStatus(''); }
                        else { setSoundGenStatus('생성 실패'); }
                      } catch { setSoundGenStatus('네트워크 오류'); }
                      finally { setIsGeneratingSound(false); }
                    }}
                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${!soundPrompt.trim() || isGeneratingSound ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white active:scale-95'}`}
                  >
                    {isGeneratingSound
                      ? <><span className="material-icons text-sm animate-spin">refresh</span>분석 중...</>
                      : <><span className="material-icons text-sm">auto_awesome</span>사운드 효과 제안</>}
                  </button>

                  {/* 제안 결과 */}
                  {soundSuggestions.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {soundSuggestions.map((s, i) => (
                        <div key={i} className="rounded-lg bg-white/5 border border-white/10 p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] text-white font-medium truncate">{s.text}</div>
                            {s.time >= 0 && <div className="text-[9px] text-text-secondary">{s.time.toFixed(1)}s</div>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {/* TTS로 생성 */}
                            <button onClick={() => { setTtsText(s.text); }}
                              className="px-1.5 py-1 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[9px] hover:bg-blue-500/30 transition-all">
                              TTS
                            </button>
                            {/* 대본에 추가 */}
                            <button
                              className="px-1.5 py-1 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[9px] hover:bg-purple-500/30 transition-all"
                              onClick={() => {
                                if (onAddSubtitleClips) {
                                  onAddSubtitleClips([{
                                    id: Math.random().toString(36).slice(2),
                                    originalText: `🎵 ${s.text}`,
                                    editedText: `🎵 ${s.text}`,
                                    startTime: Math.max(0, s.time),
                                    endTime: Math.max(0, s.time) + 2,
                                    color: '#A78BFA', strokeColor: '#1e1b4b', isEdited: false,
                                  }], 0, false);
                                }
                              }}>
                              대본
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {soundGenStatus && <div className="mt-2 text-center text-[10px] text-text-secondary">{soundGenStatus}</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DETAILS TAB ===== */}
        {activeTab === 'details' && (
          <div className="p-4 space-y-6">
            {!selectedClip && (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <span className="material-icons text-4xl text-gray-600">touch_app</span>
                <p className="text-xs text-gray-500">프리뷰 또는 타임라인에서<br />영상을 선택해주세요</p>
              </div>
            )}
            <div className={`space-y-3 ${!selectedClip ? 'opacity-40 pointer-events-none' : ''}`}>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center space-x-1"><span className="material-icons text-sm text-blue-400">movie</span><span>Video</span></span>
                <span className="material-icons text-sm cursor-pointer hover:text-primary">expand_less</span>
              </h3>
              <div className="space-y-4">
                {/* Scale */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">zoom_in</span><span>Scale</span></label>
                  <div className="flex items-center space-x-2 w-2/3">
                    <input className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary" type="range" min="0" max="200" value={scale}
                      onChange={(e) => { const v = Number(e.target.value); setScale(v); updateProp('scale', v); }} disabled={!selectedClip} />
                    <input className="w-12 bg-black border border-border-color rounded text-xs px-1 py-0.5 text-right focus:outline-none focus:border-primary disabled:opacity-50" type="number" value={scale}
                      onChange={(e) => { const v = Number(e.target.value); setScale(v); updateProp('scale', v); }} disabled={!selectedClip} />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                </div>
                {/* Position */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">open_with</span><span>Position</span></label>
                  <div className="flex items-center space-x-2 w-2/3">
                    <div className="flex items-center bg-black border border-border-color rounded px-1 w-1/2">
                      <span className="text-[10px] text-gray-500 mr-1">X</span>
                      <input className="w-full bg-transparent text-xs py-0.5 text-right focus:outline-none disabled:opacity-50" type="number" value={positionX}
                        onChange={(e) => { const v = Number(e.target.value); setPositionX(v); updateProp('positionX', v); }} disabled={!selectedClip} />
                    </div>
                    <div className="flex items-center bg-black border border-border-color rounded px-1 w-1/2">
                      <span className="text-[10px] text-gray-500 mr-1">Y</span>
                      <input className="w-full bg-transparent text-xs py-0.5 text-right focus:outline-none disabled:opacity-50" type="number" value={positionY}
                        onChange={(e) => { const v = Number(e.target.value); setPositionY(v); updateProp('positionY', v); }} disabled={!selectedClip} />
                    </div>
                  </div>
                </div>
                {/* Rotation */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">rotate_right</span><span>Rotate</span></label>
                  <div className="flex items-center space-x-2 w-2/3">
                    <button className="w-6 h-6 rounded-full border border-gray-600 flex items-center justify-center hover:border-white active:scale-90"
                      onClick={() => { setRotation(0); updateProp('rotation', 0); }}>
                      <span className="material-icons text-[14px]">refresh</span>
                    </button>
                    <input className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50" type="range" min="-180" max="180" value={rotation}
                      onChange={(e) => { const v = Number(e.target.value); setRotation(v); updateProp('rotation', v); }} disabled={!selectedClip} />
                    <input className="w-10 bg-black border border-border-color rounded text-xs px-1 py-0.5 text-right focus:outline-none focus:border-primary disabled:opacity-50" type="number" value={rotation}
                      onChange={(e) => { const v = Number(e.target.value); setRotation(v); updateProp('rotation', v); }} disabled={!selectedClip} />
                    <span className="text-[10px] text-gray-500">°</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={`w-full h-px bg-border-color ${!selectedClip ? 'opacity-40' : ''}`} />
            <div className={`space-y-3 ${!selectedClip ? 'opacity-40 pointer-events-none' : ''}`}>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center space-x-1"><span className="material-icons text-sm text-purple-400">blur_on</span><span>Blend</span></span>
                <div className="relative inline-block w-8 mr-2 align-middle select-none">
                  <input className="toggle-checkbox absolute block w-3 h-3 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 checked:border-primary right-5 disabled:opacity-50"
                    id="toggle" type="checkbox" checked={blendMode} onChange={(e) => { setBlendMode(e.target.checked); updateProp('blendMode', e.target.checked); }} disabled={!selectedClip} />
                  <label className={`toggle-label block overflow-hidden h-3 rounded-full cursor-pointer ${blendMode ? 'bg-primary/50' : 'bg-gray-700'} ${!selectedClip ? 'opacity-50' : ''}`} htmlFor="toggle" />
                </div>
              </h3>
              {/* Opacity */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">opacity</span><span>Opacity</span></label>
                <div className="flex items-center space-x-2 w-2/3">
                  <input className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50" type="range" min="0" max="100" value={opacity}
                    onChange={(e) => { const v = Number(e.target.value); setOpacity(v); updateProp('opacity', v); }} disabled={!selectedClip} />
                  <input className="w-10 bg-black border border-border-color rounded text-xs px-1 py-0.5 text-right focus:outline-none focus:border-primary disabled:opacity-50" type="number" min="0" max="100" value={opacity}
                    onChange={(e) => { const v = Math.min(100, Math.max(0, Number(e.target.value))); setOpacity(v); updateProp('opacity', v); }} disabled={!selectedClip} />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              </div>
            </div>
            <div className="mt-auto pt-6">
              <div className="bg-black/30 p-3 rounded border border-border-color space-y-2">
                <div className="flex justify-between items-center text-[10px] text-gray-500">
                  <span className="flex items-center space-x-1"><span className="material-icons text-xs">aspect_ratio</span><span>Resolution</span></span>
                  <span className="text-gray-300">1920 x 1080</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-gray-500">
                  <span className="flex items-center space-x-1"><span className="material-icons text-xs">speed</span><span>Frame Rate</span></span>
                  <span className="text-gray-300">30.00 fps</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== EXPORT TAB ===== */}
        {activeTab === 'export' && (
          <div className="p-4 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Export Settings</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Format</span>
                <select className="bg-black border border-border-color rounded text-xs px-2 py-1 text-white focus:outline-none focus:border-primary">
                  <option>MP4 (H.264)</option>
                  <option>MOV (ProRes)</option>
                  <option>WebM (VP9)</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Resolution</span>
                <select className="bg-black border border-border-color rounded text-xs px-2 py-1 text-white focus:outline-none focus:border-primary">
                  <option>1080p</option>
                  <option>720p</option>
                  <option>4K</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Quality</span>
                <select className="bg-black border border-border-color rounded text-xs px-2 py-1 text-white focus:outline-none focus:border-primary">
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              <button onClick={onExport} className="w-full bg-primary hover:bg-blue-500 text-white py-2 rounded text-xs font-semibold transition-all active:scale-95">
                <span className="flex items-center justify-center gap-1">
                  <span className="material-icons text-sm">file_download</span>
                  Export Video
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      <UpgradeModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
      />
    </aside>
  );
});

export default RightSidebar;

/**
 * AI 자막과 시간이 겹치는 대본 구간을 제거/트리밍
 * - 완전히 겹치면 제거
 * - 부분적으로 겹치면 겹치지 않는 부분만 남김
 */
function removeOverlappingTranscripts(
  transcripts: TranscriptItem[],
  aiSubtitles: TranscriptItem[],
): TranscriptItem[] {
  if (aiSubtitles.length === 0) return transcripts;

  const result: TranscriptItem[] = [];

  for (const t of transcripts) {
    let segments: { start: number; end: number }[] = [{ start: t.startTime, end: t.endTime }];

    for (const ai of aiSubtitles) {
      const next: { start: number; end: number }[] = [];
      for (const seg of segments) {
        // No overlap
        if (ai.endTime <= seg.start || ai.startTime >= seg.end) {
          next.push(seg);
          continue;
        }
        // Left remainder
        if (ai.startTime > seg.start) {
          next.push({ start: seg.start, end: ai.startTime });
        }
        // Right remainder
        if (ai.endTime < seg.end) {
          next.push({ start: ai.endTime, end: seg.end });
        }
        // Fully covered → nothing added
      }
      segments = next;
    }

    // Only keep segments with meaningful duration (> 0.3s)
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.end - seg.start > 0.3) {
        result.push({
          ...t,
          id: i === 0 ? t.id : `${t.id}_${i}`,
          startTime: seg.start,
          endTime: seg.end,
        });
      }
    }
  }

  return result;
}

function fmtTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
