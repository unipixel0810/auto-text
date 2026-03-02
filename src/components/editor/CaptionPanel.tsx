'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { generateSubtitlesWithGemini } from '@/lib/geminiService';
import type { TranscriptItem, SubtitleItem } from '@/types/subtitle';

interface CaptionPanelProps {
  transcripts: TranscriptItem[];
  subtitles: SubtitleItem[];
  currentTime: number;
  onTranscriptsUpdate: (transcripts: TranscriptItem[]) => void;
  onSubtitlesUpdate: (subtitles: SubtitleItem[]) => void;
  onSeek: (time: number) => void;
}

type TabType = 'caption' | 'text' | 'animation' | 'tracking' | 'tts';

export default function CaptionPanel({
  transcripts,
  subtitles,
  currentTime,
  onTranscriptsUpdate,
  onSubtitlesUpdate,
  onSeek,
}: CaptionPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('caption');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [userScript, setUserScript] = useState<string>('');
  const [aiScript, setAiScript] = useState<string>('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isAutoCaptionEnabled, setIsAutoCaptionEnabled] = useState(false);
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 필터링된 대본 목록
  const filteredTranscripts = transcripts.filter((t) =>
    (t.editedText || t.originalText).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // AI 자막 생성
  const handleGenerateAISubtitles = useCallback(async () => {
    if (transcripts.length === 0) {
      alert('대본이 없습니다. 먼저 대본을 입력하거나 업로드해주세요.');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const generated = await generateSubtitlesWithGemini({ transcripts });
      const subtitleItems: SubtitleItem[] = generated.map((g, i) => ({
        id: `ai_${Date.now()}_${i}`,
        startTime: g.startTime,
        endTime: g.endTime,
        text: g.text,
        type: g.type,
        confidence: 0.9,
      }));
      onSubtitlesUpdate([...subtitles, ...subtitleItems]);
      setAiScript(generated.map((g) => g.text).join('\n'));
    } catch (error) {
      console.error('AI 자막 생성 실패:', error);
      alert('AI 자막 생성에 실패했습니다.');
    } finally {
      setIsGeneratingAI(false);
    }
  }, [transcripts, subtitles, onSubtitlesUpdate]);

  // 사용자 대본에서 AI 자막 생성
  const handleGenerateFromUserScript = useCallback(async () => {
    if (!userScript.trim()) {
      alert('대본을 입력해주세요.');
      return;
    }

    // 사용자 대본을 TranscriptItem 형식으로 변환
    const lines = userScript.trim().split('\n').filter((line) => line.trim());
    const scriptTranscripts: TranscriptItem[] = lines.map((line, i) => ({
      id: `script_${i}`,
      startTime: i * 3, // 각 줄당 3초
      endTime: (i + 1) * 3,
      originalText: line.trim(),
      editedText: line.trim(),
      isEdited: false,
    }));

    setIsGeneratingAI(true);
    try {
      const generated = await generateSubtitlesWithGemini({ transcripts: scriptTranscripts });
      const subtitleItems: SubtitleItem[] = generated.map((g, i) => ({
        id: `ai_script_${Date.now()}_${i}`,
        startTime: g.startTime,
        endTime: g.endTime,
        text: g.text,
        type: g.type,
        confidence: 0.9,
      }));
      onSubtitlesUpdate([...subtitles, ...subtitleItems]);
      setAiScript(generated.map((g) => g.text).join('\n'));
      onTranscriptsUpdate([...transcripts, ...scriptTranscripts]);
    } catch (error) {
      console.error('AI 자막 생성 실패:', error);
      alert('AI 자막 생성에 실패했습니다.');
    } finally {
      setIsGeneratingAI(false);
    }
  }, [userScript, transcripts, subtitles, onSubtitlesUpdate, onTranscriptsUpdate]);

  return (
    <div className="h-full flex flex-col bg-panel-bg border-l border-border-color">
      {/* 탭 네비게이션 */}
      <div className="flex border-b border-border-color bg-editor-bg">
        {[
          { id: 'caption' as TabType, label: '캡션', icon: 'subtitles' },
          { id: 'text' as TabType, label: '텍스트', icon: 'title' },
          { id: 'animation' as TabType, label: '애니메이션', icon: 'animation' },
          { id: 'tracking' as TabType, label: '트래킹', icon: 'track_changes' },
          { id: 'tts' as TabType, label: '텍스트에서 음성으로', icon: 'record_voice_over' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 py-2 px-3 text-xs font-medium transition-all duration-200 relative group
              ${activeTab === tab.id
                ? 'text-primary border-b-2 border-primary bg-white/5 scale-105'
                : 'text-text-secondary hover:text-white hover:bg-white/5'
              }
              active:scale-95 hover:scale-105
            `}
          >
            <span className={`flex items-center justify-center gap-1 ${activeTab === tab.id ? 'animate-pulse' : ''}`}>
              <span className={`material-icons text-sm transition-transform duration-200 ${activeTab === tab.id ? 'animate-bounce' : 'group-hover:scale-110'}`}>
                {tab.icon}
              </span>
              <span className="hidden sm:inline">{tab.label}</span>
            </span>
          </button>
        ))}
        
        {/* 우측 아이콘들 */}
        <div className="flex items-center gap-2 px-2 border-l border-border-color">
          <button
            onClick={() => setIsAutoCaptionEnabled(!isAutoCaptionEnabled)}
            className={`p-1.5 rounded transition-all duration-200 ${
              isAutoCaptionEnabled
                ? 'bg-primary/20 text-primary scale-110'
                : 'text-text-secondary hover:text-white hover:bg-white/5'
            } active:scale-95 hover:scale-110`}
            title="자동 캡션"
          >
            <span className={`material-icons text-sm transition-transform duration-200 ${isAutoCaptionEnabled ? 'animate-spin' : 'group-hover:rotate-12'}`}>
              auto_awesome
            </span>
          </button>
          <button
            className="p-1.5 rounded text-text-secondary hover:text-white hover:bg-white/5 transition-all duration-200 active:scale-95 hover:scale-110"
            title="텍스트 정렬"
          >
            <span className="material-icons text-sm transition-transform duration-200 group-hover:rotate-90">format_align_center</span>
          </button>
          <button
            className="p-1.5 rounded text-text-secondary hover:text-white hover:bg-white/5 transition-all duration-200 active:scale-95 hover:scale-110"
            title="설정"
          >
            <span className="material-icons text-sm transition-transform duration-200 group-hover:rotate-90">tune</span>
          </button>
          <button
            className="p-1.5 rounded text-text-secondary hover:text-white hover:bg-white/5 transition-all duration-200 active:scale-95 hover:scale-110"
            title="도움말"
          >
            <span className="material-icons text-sm transition-transform duration-200 group-hover:scale-125">help_outline</span>
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽: 캡션 리스트 */}
        <div className="flex-1 flex flex-col border-r border-border-color">
          {/* 검색 바 */}
          <div className="p-3 border-b border-border-color">
            <div className="relative">
              <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary text-sm">
                search
              </span>
              <input
                type="text"
                placeholder="검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-black/30 border border-border-color rounded text-sm text-white placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* 캡션 리스트 */}
          <div className="flex-1 overflow-y-auto p-2">
            {activeTab === 'caption' && (
              <div className="space-y-1">
                {filteredTranscripts.map((transcript, index) => {
                  const isSelected = selectedTranscriptId === transcript.id;
                  const isActive = currentTime >= transcript.startTime && currentTime < transcript.endTime;
                  
                  return (
                    <div
                      key={transcript.id}
                      onClick={() => {
                        setSelectedTranscriptId(transcript.id);
                        onSeek(transcript.startTime);
                      }}
                      className={`
                        flex items-center gap-2 p-2 rounded cursor-pointer transition-all duration-200
                        ${isActive
                          ? 'bg-primary/20 border border-primary'
                          : isSelected
                          ? 'bg-white/10 border border-white/20'
                          : 'hover:bg-white/5 border border-transparent'
                        }
                        active:scale-[0.98]
                      `}
                    >
                      <span className="text-xs text-text-secondary font-mono min-w-[40px]">
                        {index + 1}
                      </span>
                      <span className="flex-1 text-sm text-white">
                        {transcript.editedText || transcript.originalText}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // 타임라인에 추가 기능
                          }}
                          className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-white transition-all duration-200 active:scale-90 hover:scale-110"
                        >
                          <span className="material-icons text-sm transition-transform duration-200 hover:rotate-90">add</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // 편집 기능
                          }}
                          className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-white transition-all duration-200 active:scale-90 hover:scale-110"
                        >
                          <span className="material-icons text-sm transition-transform duration-200 hover:rotate-12">edit</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredTranscripts.length === 0 && (
                  <div className="text-center py-8 text-text-secondary text-sm">
                    {searchQuery ? '검색 결과가 없습니다' : '대본이 없습니다'}
                  </div>
                )}
              </div>
            )}

            {activeTab !== 'caption' && (
              <div className="text-center py-8 text-text-secondary text-sm">
                {activeTab === 'text' && '텍스트 편집 기능'}
                {activeTab === 'animation' && '애니메이션 설정'}
                {activeTab === 'tracking' && '트래킹 설정'}
                {activeTab === 'tts' && '텍스트-음성 변환'}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 대본 패널 (CapCut 스타일) */}
        <div className="w-80 flex flex-col border-l border-border-color bg-editor-bg">
          <div className="p-3 border-b border-border-color">
            <h3 className="text-sm font-semibold mb-2">대본</h3>
            <div className="flex gap-2 mb-2">
              <Button
                variant="primary"
                size="sm"
                icon="auto_awesome"
                onClick={handleGenerateFromUserScript}
                disabled={isGeneratingAI || !userScript.trim()}
                className="flex-1"
              >
                {isGeneratingAI ? '생성 중...' : 'AI 자막 생성'}
              </Button>
            </div>
          </div>

          {/* 사용자 대본 */}
          <div className="flex-1 flex flex-col border-b border-border-color">
            <div className="px-3 py-2 bg-panel-bg border-b border-border-color">
              <h4 className="text-xs font-medium text-text-secondary">내 대본</h4>
            </div>
            <textarea
              ref={scriptTextareaRef}
              value={userScript}
              onChange={(e) => setUserScript(e.target.value)}
              placeholder="대본을 입력하세요..."
              className="flex-1 p-3 bg-transparent text-sm text-white placeholder-text-secondary resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* AI 생성 대본 */}
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-2 bg-panel-bg border-b border-border-color">
              <h4 className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <span className="material-icons text-sm text-primary">auto_awesome</span>
                AI 생성 대본
              </h4>
            </div>
            <div className="flex-1 p-3 overflow-y-auto">
              {aiScript ? (
                <div className="text-sm text-white whitespace-pre-wrap">{aiScript}</div>
              ) : (
                <div className="text-text-secondary text-sm text-center py-8">
                  AI 자막 생성 버튼을 눌러주세요
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
