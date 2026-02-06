'use client';

import React, { useState, useCallback, useEffect } from 'react';
import VideoUploader from '@/components/VideoUploader';
import TranscriptEditor from '@/components/editor/TranscriptEditor';
import AISubtitleEditor from '@/components/editor/AISubtitleEditor';
import StylePanel from '@/components/editor/StylePanel';
import VideoPreview from '@/components/editor/VideoPreview';
import { transcribeVideo } from '@/lib/sttService';
import { splitSubtitles } from '@/lib/subtitleSplitter';
import { generateSubtitlesWithGemini, convertToSubtitleItems, correctSpelling } from '@/lib/geminiService';
import { renderVideoWithSubtitles, downloadSRT, downloadBlob, type RenderProgress } from '@/lib/videoRenderer';
import type { SubtitleItem, TranscriptItem, SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';

// 기본 스타일 (숏츠용: 하단 UI 피하도록 y: 75%)
const DEFAULT_STYLE: SubtitleStyle = {
  x: 50,
  y: 75,
  fontFamily: 'PaperlogyExtraBold',
  fontSize: 41,
  fontWeight: 700,
  color: '#FFFFFF',
  backgroundColor: 'transparent',
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowColor: 'rgba(0,0,0,0.8)',
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  shadowBlur: 4,
  textAlign: 'center',
};

// 완료 알림 함수 (콘솔만)
const playCompletionSound = (message: string) => {
  console.log('✅', message);
};

type AppStage = 'upload' | 'transcribing' | 'editing' | 'rendering';

export default function Home() {
  // 앱 상태
  const [stage, setStage] = useState<AppStage>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // 콘텐츠
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);

  // 에디터 상태
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [globalStyle, setGlobalStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  const [activePanel, setActivePanel] = useState<'transcript' | 'subtitle' | 'style'>('transcript');

  // 진행 상태
  const [progress, setProgress] = useState({ stage: '', percent: 0, message: '' });
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);

  // 비디오 업로드 처리
  const handleVideoUpload = useCallback(async (file: File) => {
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setError(null);
    await startTranscription(file);
  }, []);

  // STT 시작 (API 키는 서버에서 관리)
  const startTranscription = async (file: File) => {
    setStage('transcribing');
    setProgress({ stage: 'transcribing', percent: 0, message: '음성 인식 준비 중...' });

    try {
      const result = await transcribeVideo(file, '', (msg) => {
        setProgress({ stage: 'transcribing', percent: 50, message: msg });
      });

      // STT 결과를 자막 세그먼트로 분할
      const segments = splitSubtitles(result);

      // TranscriptItem으로 변환
      const items: TranscriptItem[] = segments.map((seg, i) => ({
        id: `transcript_${i}`,
        startTime: seg.startTime,
        endTime: seg.endTime,
        originalText: seg.text,
        editedText: seg.text,
        isEdited: false,
      }));

      setTranscripts(items);
      setStage('editing');
      setProgress({ stage: '', percent: 100, message: '완료!' });
      playCompletionSound(`음성인식 완료! ${items.length}개 구간 감지`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '음성 인식 실패');
      setStage('upload');
    }
  };

  // 대본 수정
  const handleTranscriptUpdate = useCallback((id: string, editedText: string) => {
    setTranscripts(prev => prev.map(t => 
      t.id === id ? { ...t, editedText, isEdited: editedText !== t.originalText } : t
    ));
  }, []);

  // AI 자막 생성 진행률
  const [aiProgress, setAiProgress] = useState({ percent: 0, message: '' });

  // AI 자막 생성 (서버 API 사용)
  const generateAISubtitles = useCallback(async () => {
    console.log('=== AI 자막 생성 시작 ===');
    console.log('Transcripts count:', transcripts.length);

    if (transcripts.length === 0) {
      setError('대본이 없습니다. 먼저 영상을 업로드하세요.');
      return;
    }

    setIsGeneratingAI(true);
    setAiProgress({ percent: 0, message: '준비 중...' });
    setError(null);

    try {
      console.log('AI API 호출 중...');
      const generated = await generateSubtitlesWithGemini(
        { transcripts },
        undefined,  // API 키는 서버에서 관리
        (percent, message) => setAiProgress({ percent, message })
      );
      console.log('생성된 자막 수:', generated.length);
      const items = convertToSubtitleItems(generated);
      setSubtitles(items);
      setActivePanel('subtitle');
      playCompletionSound(`AI 자막 ${items.length}개 생성 완료!`);
    } catch (err) {
      console.error('AI 오류:', err);
      setError(err instanceof Error ? err.message : 'AI 자막 생성 실패');
    } finally {
      setIsGeneratingAI(false);
      setAiProgress({ percent: 0, message: '' });
    }
  }, [transcripts]);

  // 자막 업데이트
  const handleSubtitleUpdate = useCallback((id: string, updates: Partial<SubtitleItem>) => {
    setSubtitles(prev => prev.map(s => 
      s.id === id ? { ...s, ...updates } : s
    ));
  }, []);

  // 자막 삭제
  const handleSubtitleDelete = useCallback((id: string) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
    if (selectedSubtitleId === id) setSelectedSubtitleId(null);
  }, [selectedSubtitleId]);

  // 자막 추가
  const handleSubtitleAdd = useCallback((subtitle: Omit<SubtitleItem, 'id'>) => {
    const newSubtitle: SubtitleItem = {
      ...subtitle,
      id: `subtitle_${Date.now()}`,
    };
    setSubtitles(prev => [...prev, newSubtitle].sort((a, b) => a.startTime - b.startTime));
  }, []);

  // 스타일 변경
  const handleStyleChange = useCallback((updates: Partial<SubtitleStyle>) => {
    if (selectedSubtitleId) {
      // 선택된 자막의 개별 스타일 변경
      setSubtitles(prev => prev.map(s => 
        s.id === selectedSubtitleId 
          ? { ...s, style: { ...s.style, ...updates } } 
          : s
      ));
    } else {
      // 글로벌 스타일 변경
      setGlobalStyle(prev => ({ ...prev, ...updates }));
    }
  }, [selectedSubtitleId]);

  // 모든 자막에 현재 스타일 적용
  const handleApplyStyleToAll = useCallback(() => {
    setSubtitles(prev => prev.map(s => ({
      ...s,
      style: { ...globalStyle }
    })));
  }, [globalStyle]);

  // 자막 드래그 (이동)
  const handleSubtitleDrag = useCallback((id: string, x: number, y: number) => {
    setSubtitles(prev => prev.map(s => 
      s.id === id ? { ...s, style: { ...s.style, x, y } } : s
    ));
  }, []);

  // 자막 크기 조절
  const handleSubtitleResize = useCallback((id: string, scale: number) => {
    setSubtitles(prev => prev.map(s => 
      s.id === id ? { ...s, style: { ...s.style, scale } as any } : s
    ));
  }, []);

  // 자막 회전
  const handleSubtitleRotate = useCallback((id: string, rotation: number) => {
    setSubtitles(prev => prev.map(s => 
      s.id === id ? { ...s, style: { ...s.style, rotation } as any } : s
    ));
  }, []);

  // 자막 텍스트 변경 (비디오 위에서 직접 편집)
  const handleSubtitleTextChange = useCallback((id: string, text: string) => {
    setSubtitles(prev => prev.map(s => 
      s.id === id ? { ...s, text } : s
    ));
  }, []);

  // 렌더링 취소용 AbortController
  const [renderAbortController, setRenderAbortController] = useState<AbortController | null>(null);

  // 비디오 렌더링
  const handleRenderVideo = useCallback(async () => {
    if (!videoFile || subtitles.length === 0) return;

    const abortController = new AbortController();
    setRenderAbortController(abortController);
    setStage('rendering');
    setRenderProgress({ stage: 'loading', progress: 0, message: '준비 중...' });

    try {
      const blob = await renderVideoWithSubtitles(
        {
          videoFile,
          subtitles,
          globalStyle,
          outputFormat: 'mp4',
          quality: 'medium',
        },
        setRenderProgress,
        abortController.signal
      );

      downloadBlob(blob, `${videoFile.name.replace(/\.[^/.]+$/, '')}_subtitled.mp4`);
      setStage('editing');
      setRenderProgress(null);
      setRenderAbortController(null);
      playCompletionSound('영상 렌더링 완료! 다운로드가 시작됩니다.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '렌더링 실패';
      if (message !== '렌더링이 취소되었습니다.') {
        setError(message);
      }
      setStage('editing');
      setRenderProgress(null);
      setRenderAbortController(null);
    }
  }, [videoFile, subtitles, globalStyle]);

  // 렌더링 취소
  const handleCancelRender = useCallback(() => {
    if (renderAbortController) {
      renderAbortController.abort();
      setRenderAbortController(null);
    }
  }, [renderAbortController]);

  // 시크 (비디오 시간 이동)
  const [seekTo, setSeekTo] = useState<number | null>(null);
  
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    setSeekTo(time); // VideoPreview에 시간 이동 요청
  }, []);

  const handleSeekComplete = useCallback(() => {
    setSeekTo(null); // 시간 이동 완료 후 초기화
  }, []);

  // 새로 시작
  const handleReset = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setStage('upload');
    setVideoFile(null);
    setVideoUrl(null);
    setTranscripts([]);
    setSubtitles([]);
    setCurrentTime(0);
    setSelectedSubtitleId(null);
    setError(null);
    setProgress({ stage: '', percent: 0, message: '' });
  }, [videoUrl]);

  return (
    <div className="min-h-screen" style={{ background: 'hsl(220 20% 4%)' }}>
      {/* 렌더링 모달 */}
      {renderProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div 
            className="w-full max-w-sm p-6 rounded-2xl text-center"
            style={{ 
              background: 'linear-gradient(135deg, hsl(220 18% 10%) 0%, hsl(220 18% 6%) 100%)',
              border: '1px solid hsl(220 15% 18%)'
            }}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: 'hsl(185 100% 50% / 0.1)' }}
            >
              <svg className="w-8 h-8 animate-spin" style={{ color: 'hsl(185 100% 50%)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'hsl(210 40% 98%)' }}>
              {renderProgress.message}
            </h3>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'hsl(220 15% 15%)' }}>
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  width: `${renderProgress.progress}%`,
                  background: 'linear-gradient(90deg, hsl(185 100% 50%), hsl(330 80% 60%))'
                }}
              />
            </div>
            <p className="text-sm mt-2" style={{ color: 'hsl(215 20% 55%)' }}>
              {renderProgress.progress}%
            </p>
            <button
              onClick={handleCancelRender}
              className="mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{ 
                background: 'hsl(0 60% 50%)',
                color: 'white'
              }}
            >
              ✕ 렌더링 취소
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header 
        className="sticky top-0 z-40 px-6 py-3 flex items-center justify-between"
        style={{ 
          background: 'hsl(220 20% 4% / 0.95)',
          borderBottom: '1px solid hsl(220 15% 18%)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, hsl(185 100% 50%), hsl(330 80% 60%))' }}
          >
            <span className="text-xl">🎬</span>
          </div>
          <div>
            <h1 className="font-bold" style={{ color: 'hsl(210 40% 98%)' }}>자막 에디터</h1>
            <p className="text-xs" style={{ color: 'hsl(215 20% 55%)' }}>AI 기반 자막 생성</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 새 영상 업로드 버튼 - 항상 표시 */}
          {(stage === 'editing' || stage === 'transcribing') && (
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, hsl(185 100% 45%), hsl(185 100% 35%))', 
                color: 'white',
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              새 영상
            </button>
          )}

          {stage === 'editing' && (
            <>
              <button
                onClick={() => downloadSRT(subtitles)}
                disabled={subtitles.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ 
                  background: 'hsl(220 15% 15%)', 
                  color: 'hsl(210 40% 98%)',
                  border: '1px solid hsl(220 15% 25%)'
                }}
              >
                SRT 다운로드
              </button>
              <button
                onClick={handleRenderVideo}
                disabled={subtitles.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ 
                  background: 'linear-gradient(135deg, hsl(185 100% 50%), hsl(185 100% 40%))',
                  color: 'hsl(220 20% 4%)'
                }}
              >
                영상 다운로드
              </button>
            </>
          )}
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      {stage === 'upload' && (
        <main className="max-w-4xl mx-auto p-6">
          <div className="text-center mb-8 pt-12">
            <h2 className="text-4xl font-bold mb-4" style={{ color: 'hsl(210 40% 98%)' }}>
              영상에 <span style={{ color: 'hsl(185 100% 50%)' }}>AI 자막</span>을 입히세요
            </h2>
            <p style={{ color: 'hsl(215 20% 65%)' }}>
              음성인식 → 맞춤법 교정 → AI 자막 생성 → 영상 렌더링까지 한번에
            </p>
          </div>

          {error && (
            <div 
              className="mb-6 p-4 rounded-xl text-sm"
              style={{ 
                background: 'hsl(0 72% 50% / 0.1)', 
                border: '1px solid hsl(0 72% 50% / 0.3)',
                color: 'hsl(0 72% 65%)'
              }}
            >
              {error}
            </div>
          )}

          <VideoUploader 
            onFileReady={handleVideoUpload}
            maxSizeMB={2048}
          />

          <div className="grid grid-cols-3 gap-4 mt-8">
            {[
              { icon: '🎙️', title: '음성인식', desc: 'OpenAI Whisper' },
              { icon: '🤖', title: 'AI 자막', desc: 'Gemini Pro' },
              { icon: '🎬', title: '영상 렌더링', desc: 'FFmpeg.wasm' },
            ].map((item, i) => (
              <div 
                key={i}
                className="p-4 rounded-xl text-center"
                style={{ 
                  background: 'hsl(220 18% 8%)',
                  border: '1px solid hsl(220 15% 18%)'
                }}
              >
                <span className="text-2xl">{item.icon}</span>
                <h3 className="font-medium mt-2" style={{ color: 'hsl(210 40% 98%)' }}>{item.title}</h3>
                <p className="text-xs mt-1" style={{ color: 'hsl(215 20% 55%)' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </main>
      )}

      {stage === 'transcribing' && (
        <main className="max-w-md mx-auto p-6 pt-20 text-center">
          <div 
            className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ background: 'hsl(185 100% 50% / 0.1)' }}
          >
            <svg className="w-10 h-10 animate-spin" style={{ color: 'hsl(185 100% 50%)' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'hsl(210 40% 98%)' }}>
            {progress.message}
          </h2>
          <div 
            className="w-full h-2 rounded-full overflow-hidden mt-4"
            style={{ background: 'hsl(220 15% 15%)' }}
          >
            <div 
              className="h-full transition-all duration-300"
              style={{ 
                width: `${progress.percent}%`,
                background: 'linear-gradient(90deg, hsl(185 100% 50%), hsl(330 80% 60%))'
              }}
            />
          </div>
        </main>
      )}

      {stage === 'editing' && (
        <main className="h-[calc(100vh-60px)] flex">
          {/* 왼쪽 패널 - 대본 & AI 자막 & 스타일 */}
          <div 
            className="w-96 flex flex-col"
            style={{ 
              background: 'hsl(220 18% 6%)',
              borderRight: '1px solid hsl(220 15% 18%)'
            }}
          >
            {/* 탭 - 대본과 AI자막만 */}
            <div className="flex" style={{ borderBottom: '1px solid hsl(220 15% 18%)' }}>
              {[
                { id: 'transcript', label: '대본', icon: '📝' },
                { id: 'subtitle', label: 'AI자막', icon: '🎭' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActivePanel(tab.id as any)}
                  className={`flex-1 py-3 text-sm font-medium transition-all`}
                  style={{
                    background: activePanel === tab.id ? 'hsl(185 100% 50% / 0.1)' : 'transparent',
                    color: activePanel === tab.id ? 'hsl(185 100% 50%)' : 'hsl(215 20% 55%)',
                    borderBottom: activePanel === tab.id ? '2px solid hsl(185 100% 50%)' : '2px solid transparent'
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* 패널 콘텐츠 */}
            <div className="flex-1 overflow-hidden">
              {activePanel === 'transcript' && (
                <TranscriptEditor
                  transcripts={transcripts}
                  currentTime={currentTime}
                  onUpdate={handleTranscriptUpdate}
                  onSeek={handleSeek}
                />
              )}
              {activePanel === 'subtitle' && (
                <AISubtitleEditor
                  subtitles={subtitles}
                  currentTime={currentTime}
                  selectedId={selectedSubtitleId}
                  onSelect={setSelectedSubtitleId}
                  onUpdate={handleSubtitleUpdate}
                  onDelete={handleSubtitleDelete}
                  onSeek={handleSeek}
                  onAdd={handleSubtitleAdd}
                />
              )}
            </div>

            {/* AI 자막 생성 버튼 */}
            {activePanel === 'transcript' && (
              <div className="p-4" style={{ borderTop: '1px solid hsl(220 15% 18%)' }}>
                <button
                  onClick={generateAISubtitles}
                  disabled={isGeneratingAI || transcripts.length === 0}
                  className="w-full py-3 rounded-xl font-medium transition-all disabled:opacity-50"
                  style={{ 
                    background: 'linear-gradient(135deg, hsl(330 80% 60%), hsl(280 70% 50%))',
                    color: 'white'
                  }}
                >
                  {isGeneratingAI ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {aiProgress.message || 'AI 자막 생성 중...'}
                      </span>
                      <div className="w-full h-1.5 rounded-full bg-white/20 mt-1">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${aiProgress.percent}%`,
                            background: 'white'
                          }}
                        />
                      </div>
                      <span className="text-xs opacity-80">{aiProgress.percent}%</span>
                    </div>
                  ) : (
                    '🤖 AI 자막 생성 (Gemini)'
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 오른쪽 - 비디오 프리뷰 */}
          <div className="flex-1 p-6 flex flex-col items-center overflow-y-auto">
            {error && (
              <div 
                className="mb-4 p-4 rounded-xl text-sm w-full max-w-md"
                style={{ 
                  background: 'hsl(0 72% 50% / 0.1)', 
                  border: '1px solid hsl(0 72% 50% / 0.3)',
                  color: 'hsl(0 72% 65%)'
                }}
              >
                {error}
              </div>
            )}

            {/* 비디오 프리뷰 - 적당한 크기로 제한 */}
            <div className="w-full max-w-md">
            <VideoPreview
              videoUrl={videoUrl}
              subtitles={subtitles}
              globalStyle={globalStyle}
              currentTime={currentTime}
              onTimeUpdate={setCurrentTime}
              selectedSubtitleId={selectedSubtitleId}
              onSelectSubtitle={setSelectedSubtitleId}
              onSubtitleDrag={handleSubtitleDrag}
              onSubtitleResize={handleSubtitleResize}
              onSubtitleRotate={handleSubtitleRotate}
              onSubtitleDelete={handleSubtitleDelete}
              onSubtitleTextChange={handleSubtitleTextChange}
              seekTo={seekTo}
              onSeekComplete={handleSeekComplete}
            />
            </div>

            {/* 스타일 패널 - 영상 아래에 배치 */}
            <div className="w-full max-w-md mt-4">
              <StylePanel
                style={selectedSubtitleId 
                  ? { ...globalStyle, ...subtitles.find(s => s.id === selectedSubtitleId)?.style }
                  : globalStyle
                }
                onChange={handleStyleChange}
                onApplyToAll={handleApplyStyleToAll}
                compact={true}
              />
            </div>

            {/* 자막 타임라인 미리보기 */}
            <div 
              className="mt-4 p-4 rounded-xl w-full max-w-md"
              style={{ 
                background: 'hsl(220 18% 8%)',
                border: '1px solid hsl(220 15% 18%)'
              }}
            >
              <h4 className="text-sm font-medium mb-3" style={{ color: 'hsl(210 40% 98%)' }}>
                자막 타임라인
              </h4>
              <div className="flex flex-wrap gap-2">
                {subtitles.slice(0, 10).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedSubtitleId(s.id);
                      handleSeek(s.startTime);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                      selectedSubtitleId === s.id ? 'ring-2' : ''
                    }`}
                    style={{
                      background: s.type === 'ENTERTAINMENT' ? 'hsl(330 80% 60% / 0.2)' :
                        s.type === 'SITUATION' ? 'hsl(210 80% 60% / 0.2)' :
                        s.type === 'EXPLANATION' ? 'hsl(150 80% 50% / 0.2)' :
                        'hsl(45 80% 60% / 0.2)',
                      color: s.type === 'ENTERTAINMENT' ? 'hsl(330 80% 60%)' :
                        s.type === 'SITUATION' ? 'hsl(210 80% 60%)' :
                        s.type === 'EXPLANATION' ? 'hsl(150 80% 50%)' :
                        'hsl(45 80% 60%)'
                    }}
                  >
                    {s.text.slice(0, 15)}{s.text.length > 15 ? '...' : ''}
                  </button>
                ))}
                {subtitles.length > 10 && (
                  <span className="px-3 py-1.5 text-xs" style={{ color: 'hsl(215 20% 55%)' }}>
                    +{subtitles.length - 10}개 더
                  </span>
                )}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
