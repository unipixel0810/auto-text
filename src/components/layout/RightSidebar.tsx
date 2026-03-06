'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeVideo } from '@/lib/sttService';
import { parseSubtitleFile } from '@/lib/subtitleParser';
import { generateSubtitlesFromAudio } from '@/lib/geminiAudioService';
import type { TranscriptItem, SubtitleItem } from '@/types/subtitle';
import type { VideoClip } from '@/types/video';
import { SUBTITLE_PRESETS, type SubtitlePreset } from '@/lib/subtitlePresets';
import TossPaymentModal from '@/components/payment/TossPaymentModal';

interface RightSidebarProps {
  transcripts?: TranscriptItem[];
  subtitles?: SubtitleItem[];
  currentTime?: number;
  selectedClip?: VideoClip | null;
  videoFile?: File | null;
  clips?: VideoClip[];
  onTranscriptsUpdate?: (transcripts: TranscriptItem[]) => void;
  onSubtitlesUpdate?: (subtitles: SubtitleItem[]) => void;
  onSeek?: (time: number) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  onAddSubtitleClips?: (items: TranscriptItem[]) => void;
  onAddTextClip?: (preset: SubtitlePreset) => void;
  onExport?: () => void;
}

export default function RightSidebar({
  transcripts = [], subtitles = [], currentTime = 0, selectedClip = null, videoFile = null, clips = [],
  onTranscriptsUpdate, onSubtitlesUpdate, onSeek, onClipUpdate, onAddSubtitleClips, onAddTextClip, onExport,
}: RightSidebarProps) {
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
    if (selectedClip && onClipUpdate) onClipUpdate(selectedClip.id, { [prop]: value });
  }, [selectedClip, onClipUpdate]);

  // Caption states
  const [captionTab, setCaptionTab] = useState<'caption' | 'text' | 'animation' | 'tracking' | 'tts'>('caption');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [userScript, setUserScript] = useState('');
  const [aiScript, setAiScript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState('');
  const transcriptionAbortController = useRef<AbortController | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const subtitleFileRef = useRef<HTMLInputElement>(null);

  // === AUTO PIPELINE STATE ===
  const [pipelineActive, setPipelineActive] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'stt' | 'ai' | 'done'>('idle');
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState('');
  const processedFileRef = useRef<string | null>(null);

  const filteredTranscripts = transcripts.filter((t) =>
    (t.editedText || t.originalText).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle SRT/ASS file import
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
  }, [transcripts, onTranscriptsUpdate]);

  const handleAutoTranscribe = useCallback(async () => {
    if (!videoFile) { alert('비디오 파일이 필요합니다.'); return; }
    setIsTranscribing(true); setTranscriptionProgress(0); setTranscriptionStatus('음성 인식 준비 중...');
    transcriptionAbortController.current = new AbortController();
    try {
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';
      if (!apiKey) throw new Error('OpenAI API 키가 설정되지 않았습니다.');
      const result = await transcribeVideo(videoFile, apiKey, (status) => {
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
      onTranscriptsUpdate?.([...transcripts, ...newT]);
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
  }, [videoFile, transcripts, onTranscriptsUpdate]);

  const handleCancelTranscription = useCallback(() => {
    transcriptionAbortController.current?.abort();
    setIsTranscribing(false); setTranscriptionProgress(0); setTranscriptionStatus('');
  }, []);

  // Gemini Audio-based subtitle generation
  const handleGeminiAudioGenerate = useCallback(async () => {
    if (!videoFile) { alert('비디오 파일이 필요합니다.'); return; }

    setIsGeminiGenerating(true); setGeminiProgress(0); setGeminiStatus('시작...');
    try {
      // The API key is now handled backend-side. Just pass an empty string or dummy.
      const results = await generateSubtitlesFromAudio(videoFile, 'backend-proxy', (pct, msg) => {
        setGeminiProgress(pct);
        setGeminiStatus(msg);
      });
      // Convert to transcripts with style info
      const newT: TranscriptItem[] = results.map((r, i) => ({
        id: `gem_${Date.now()}_${i}`,
        startTime: r.start_time,
        endTime: r.end_time,
        originalText: r.text,
        editedText: r.text,
        isEdited: false,
      }));
      onTranscriptsUpdate?.([...transcripts, ...newT]);
      // Also create subtitle items with style
      const newSubs: SubtitleItem[] = results.map((r, i) => ({
        id: `gemsub_${Date.now()}_${i}`,
        startTime: r.start_time,
        endTime: r.end_time,
        text: r.text,
        type: r.style_type === '예능자막' ? 'ENTERTAINMENT' as const : r.style_type === '설명자막' ? 'EXPLANATION' as const : 'SITUATION' as const,
        confidence: 0.9,
      }));
      onSubtitlesUpdate?.([...subtitles, ...newSubs]);
      setAiScript(results.map(r => `[${r.style_type}] ${r.text}`).join('\n'));
      setGeminiStatus('완료!');
      setTimeout(() => { setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus(''); }, 2000);
    } catch (err: any) {
      if (err.message === 'PAYMENT_REQUIRED') {
        setShowPaymentModal(true);
      } else {
        alert(err.message || '자막 생성에 실패했습니다.');
      }
      setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus('');
    }
  }, [videoFile, transcripts, subtitles, onTranscriptsUpdate, onSubtitlesUpdate]);

  // === AUTO PIPELINE: Triggers when videoFile changes ===
  useEffect(() => {
    if (!videoFile) return;
    // Prevent re-running for the same file
    const fileKey = `${videoFile.name}_${videoFile.size}_${videoFile.lastModified}`;
    if (processedFileRef.current === fileKey) return;
    processedFileRef.current = fileKey;

    const runPipeline = async () => {
      setPipelineActive(true);
      setPipelineStep('stt');
      setPipelineProgress(0);
      setPipelineStatus('🎤 음성 인식 준비 중...');

      // Step 1: STT (Whisper)
      try {
        // Backend key approach, but we need dummy for signature
        const result = await transcribeVideo(videoFile, 'backend-proxy', (status) => {
          setPipelineStatus(`🎤 ${status}`);
          if (status.includes('오디오 추출')) setPipelineProgress(10);
          else if (status.includes('파일 처리')) setPipelineProgress(20);
          else if (status.includes('음성 인식')) {
            const m = status.match(/(\d+)\/(\d+)/);
            if (m) setPipelineProgress(20 + (parseInt(m[1]) / parseInt(m[2])) * 25);
          }
          else if (status.includes('완료')) setPipelineProgress(45);
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
        onTranscriptsUpdate?.(newT);
      } catch (err: any) {
        if (err.message === 'PAYMENT_REQUIRED') setShowPaymentModal(true);
        console.warn('[Auto Pipeline] STT 단계 건너뜀:', err);
      }

      // Step 2: AI Subtitle Generation (Gemini)
      setPipelineStep('ai');
      setPipelineProgress(50);
      setPipelineStatus('🤖 AI 자막 생성 중...');

      try {
        const results = await generateSubtitlesFromAudio(videoFile, 'backend-proxy', (pct, msg) => {
          setPipelineProgress(50 + (pct / 2));
          setPipelineStatus(`🤖 ${msg}`);
        });

        const newT: TranscriptItem[] = results.map((r, i) => ({
          id: `gem_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          originalText: r.text,
          editedText: r.text,
          isEdited: false,
        }));
        // Merge with existing transcripts from STT step
        onTranscriptsUpdate?.(newT);

        const newSubs: SubtitleItem[] = results.map((r, i) => ({
          id: `gemsub_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          text: r.text,
          type: r.style_type === '예능자막' ? 'ENTERTAINMENT' as const : r.style_type === '설명자막' ? 'EXPLANATION' as const : 'SITUATION' as const,
          confidence: 0.9,
        }));
        onSubtitlesUpdate?.([...subtitles, ...newSubs]);
        setAiScript(results.map(r => `[${r.style_type}] ${r.text}`).join('\n'));

        // Auto-add to timeline
        if (onAddSubtitleClips && newT.length > 0) {
          onAddSubtitleClips(newT);
        }
      } catch (err: any) {
        if (err.message === 'PAYMENT_REQUIRED') setShowPaymentModal(true);
        console.warn('[Auto Pipeline] AI 자막 단계 건너뜀:', err);
      }

      setPipelineStep('done');
      setPipelineProgress(100);
      setPipelineStatus('✅ 자동 자막 생성 완료!');
      setTimeout(() => {
        setPipelineActive(false);
        setPipelineStep('idle');
        setPipelineProgress(0);
        setPipelineStatus('');
      }, 3000);
    };

    runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile]);

  // Preset click handler — creates text clip at center of canvas
  const handlePresetClick = (preset: SubtitlePreset) => {
    setSelectedPresetId(preset.id);
    if (preset.id !== 0 && onAddTextClip) {
      onAddTextClip(preset);
    }
  };

  // Drag start for preset swatch → store preset data
  const handlePresetDragStart = (e: React.DragEvent, preset: SubtitlePreset) => {
    e.dataTransfer.setData('application/subtitle-preset', JSON.stringify(preset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="w-full h-full bg-panel-bg border-l border-border-color flex flex-col overflow-hidden">
      {/* Auto Pipeline Progress Overlay */}
      {pipelineActive && (
        <div className="bg-gradient-to-r from-blue-900/80 to-cyan-900/80 border-b border-cyan-500/30 px-3 py-2.5 animate-pulse-subtle">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-white flex items-center gap-1">
              <span className="material-icons text-sm text-cyan-400 animate-spin">autorenew</span>
              자동 자막 파이프라인
            </span>
            <span className="text-[10px] text-cyan-300 font-mono">{Math.round(pipelineProgress)}%</span>
          </div>
          <div className="w-full h-2 bg-black/30 rounded-full overflow-hidden mb-1">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${pipelineProgress}%`,
                background: pipelineStep === 'stt'
                  ? 'linear-gradient(90deg, #3B82F6, #2563EB)'
                  : pipelineStep === 'ai'
                    ? 'linear-gradient(90deg, #06B6D4, #0891B2)'
                    : 'linear-gradient(90deg, #10B981, #059669)',
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-gray-300">{pipelineStatus}</span>
            <div className="flex gap-1">
              {['stt', 'ai', 'done'].map((step, i) => (
                <div key={step} className={`w-1.5 h-1.5 rounded-full transition-all ${pipelineStep === step ? 'bg-cyan-400 scale-125' :
                  ['stt', 'ai', 'done'].indexOf(pipelineStep) > i ? 'bg-green-400' : 'bg-gray-600'
                  }`} />
              ))}
            </div>
          </div>
        </div>
      )}

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
                { id: 'tts' as const, icon: 'record_voice_over' },
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
                  <div className="relative">
                    <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary text-xs">search</span>
                    <input type="text" placeholder="검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 bg-black/30 border border-border-color rounded text-xs text-white placeholder-text-secondary focus:outline-none focus:border-primary" />
                  </div>
                  {/* SRT/ASS Import (hidden, triggered from LeftSidebar import button) */}
                  <input ref={subtitleFileRef} type="file" accept=".srt,.ass,.ssa" className="hidden" onChange={handleSubtitleFileImport} />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredTranscripts.map((t, i) => {
                    const isActive = currentTime >= t.startTime && currentTime < t.endTime;
                    return (
                      <div key={t.id} onClick={() => { setSelectedTranscriptId(t.id); onSeek?.(t.startTime); }}
                        className={`flex items-start gap-2 p-1.5 rounded cursor-pointer text-xs ${isActive ? 'bg-primary/20 border border-primary' : selectedTranscriptId === t.id ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5 border border-transparent'} active:scale-[0.98]`}>
                        <span className="text-[10px] text-text-secondary font-mono min-w-[30px]">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] text-gray-500 font-mono mb-0.5">
                            {fmtTimestamp(t.startTime)} → {fmtTimestamp(t.endTime)}
                          </div>
                          {selectedTranscriptId === t.id ? (
                            <input
                              type="text"
                              value={t.editedText || t.originalText}
                              onChange={(e) => handleTranscriptEdit(t.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full bg-black/30 border border-border-color rounded text-xs text-white px-1 py-0.5 focus:outline-none focus:border-primary"
                            />
                          ) : (
                            <span className="text-xs text-white truncate block">{t.editedText || t.originalText}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredTranscripts.length === 0 && <div className="text-center py-8 text-text-secondary text-xs">{searchQuery ? '검색 결과 없음' : '대본이 없습니다'}</div>}
                </div>
                <div className="border-t border-border-color flex flex-col" style={{ height: '40%' }}>
                  <div className="p-2 border-b border-border-color bg-panel-bg space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold">대본</h3>
                    </div>
                    {/* Button 1: 자막대본 자동생성 */}
                    <button onClick={handleAutoTranscribe} disabled={isTranscribing || !videoFile}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 shadow-md ${isTranscribing || !videoFile
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white hover:shadow-blue-500/30 hover:brightness-110'
                        }`}>
                      {isTranscribing ? (
                        <><span className="material-icons text-sm animate-spin">refresh</span>{transcriptionStatus || '인식 중...'}</>
                      ) : (
                        <><span className="text-base">🎤</span>자막대본 자동생성</>
                      )}
                    </button>
                    {isTranscribing && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-text-secondary">{transcriptionStatus}</span>
                          <span className="text-blue-400 font-mono">{Math.round(transcriptionProgress)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#3B82F6] to-[#2563EB] transition-all duration-300" style={{ width: `${transcriptionProgress}%` }} />
                        </div>
                        <button onClick={handleCancelTranscription} className="w-full py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-600/20 rounded transition-all">취소</button>
                      </div>
                    )}

                    {/* Button 2: Gemini AI 자막생성 */}
                    <button onClick={handleGeminiAudioGenerate} disabled={isGeminiGenerating || !videoFile}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 shadow-md ${isGeminiGenerating || !videoFile
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-r from-[#06B6D4] to-[#0891B2] text-white hover:shadow-cyan-500/30 hover:brightness-110'
                        }`}>
                      {isGeminiGenerating ? (
                        <><span className="material-icons text-sm animate-spin">refresh</span>{geminiStatus || '생성 중...'}</>
                      ) : (
                        <><span className="text-base">🤖</span>Gemini AI 자막생성</>
                      )}
                    </button>
                    {isGeminiGenerating && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-text-secondary">{geminiStatus}</span>
                          <span className="text-cyan-400 font-mono">{geminiProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#06B6D4] to-[#0891B2] transition-all duration-300" style={{ width: `${geminiProgress}%` }} />
                        </div>
                      </div>
                    )}
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
                    <div className="flex-1 p-2 overflow-y-auto">
                      {aiScript ? <div className="text-xs text-white whitespace-pre-wrap">{aiScript}</div>
                        : <div className="text-text-secondary text-[10px] text-center py-4">AI 자막 생성 버튼을 눌러주세요</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TEXT TAB: Font Style Presets ===== */}
            {captionTab === 'text' && (
              <div className="p-3 space-y-3">
                <h3 className="text-xs font-semibold text-white">자막 스타일 프리셋</h3>
                <p className="text-[10px] text-gray-500">클릭하여 추가하거나 프리뷰로 드래그하세요</p>
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
                        minHeight: '56px',
                        backgroundColor: preset.backgroundColor === 'transparent' ? '#1a1a2e' : preset.backgroundColor,
                        ...(preset.borderColor && selectedPresetId !== preset.id ? { borderColor: preset.borderColor } : {}),
                      }}
                    >
                      {preset.id === 0 ? (
                        <span className="material-icons text-gray-500 text-lg">close</span>
                      ) : (
                        <span style={{
                          fontSize: '22px',
                          fontWeight: 700,
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
              </div>
            )}

            {captionTab === 'animation' && <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">애니메이션 설정</div>}
            {captionTab === 'tracking' && <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">트래킹 설정</div>}
            {captionTab === 'tts' && <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">텍스트-음성 변환</div>}
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

      <TossPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
      />
    </aside>
  );
}

function fmtTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
