'use client';

import React, { useState, useCallback } from 'react';
import type { SubtitleItem, SubtitleType } from '@/types/subtitle';

interface AISubtitleEditorProps {
  subtitles: SubtitleItem[];
  currentTime: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<SubtitleItem>) => void;
  onDelete: (id: string) => void;
  onSeek: (time: number) => void;
  onAdd: (subtitle: Omit<SubtitleItem, 'id'>) => void;
  onMergeWithPrevious?: (id: string) => void;
  onSplitSubtitle?: (id: string, splitIndex: number) => void;
  onRegenerateWithType?: (id: string, type: SubtitleType, originalText: string) => Promise<void>;
}

const TYPE_CONFIG: Record<SubtitleType, { color: string; label: string; icon: string }> = {
  ENTERTAINMENT: { color: 'hsl(330 80% 60%)', label: '예능', icon: '🎭' },
  SITUATION: { color: 'hsl(210 80% 60%)', label: '상황', icon: '📍' },
  EXPLANATION: { color: 'hsl(150 80% 50%)', label: '설명', icon: '📚' },
  TRANSCRIPT: { color: 'hsl(45 80% 60%)', label: '말자막', icon: '💬' },
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AISubtitleEditor({
  subtitles,
  currentTime,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onSeek,
  onAdd,
  onMergeWithPrevious,
  onSplitSubtitle,
  onRegenerateWithType,
}: AISubtitleEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState<SubtitleType>('ENTERTAINMENT');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [originalType, setOriginalType] = useState<SubtitleType>('ENTERTAINMENT');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const startEditing = useCallback((item: SubtitleItem) => {
    setEditingId(item.id);
    setEditText(item.text);
    setEditType(item.type);
    setOriginalType(item.type); // 원래 유형 저장
  }, []);

  const saveEdit = useCallback(async (id: string) => {
    // 유형이 변경되었고 AI 재생성 함수가 있으면 AI로 재생성
    if (editType !== originalType && onRegenerateWithType) {
      setIsRegenerating(true);
      try {
        await onRegenerateWithType(id, editType, editText);
      } catch (err) {
        console.error('AI 재생성 실패:', err);
        // 실패시 유형만 변경
        onUpdate(id, { text: editText, type: editType });
      }
      setIsRegenerating(false);
    } else {
      onUpdate(id, { text: editText, type: editType });
    }
    setEditingId(null);
  }, [editText, editType, originalType, onUpdate, onRegenerateWithType]);

  const handleAddNew = useCallback(() => {
    const newSubtitle: Omit<SubtitleItem, 'id'> = {
      startTime: currentTime,
      endTime: currentTime + 2.5,
      text: '새 자막',
      type: 'ENTERTAINMENT',
      confidence: 1,
    };
    onAdd(newSubtitle);
  }, [currentTime, onAdd]);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid hsl(220 15% 18%)' }}>
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 rounded-full" style={{ background: 'hsl(330 80% 60%)' }} />
          <h3 className="font-semibold" style={{ color: 'hsl(210 40% 98%)' }}>AI 자막</h3>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
            background: 'hsl(330 80% 60% / 0.1)', 
            color: 'hsl(330 80% 60%)' 
          }}>
            {subtitles.length}개
          </span>
        </div>
        <button
          onClick={handleAddNew}
          className="p-2 rounded-lg transition-all duration-200"
          style={{ background: 'hsl(185 100% 50% / 0.1)', color: 'hsl(185 100% 50%)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* 자막 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {subtitles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'hsl(215 20% 45%)' }}>
              Gemini로 AI 자막을 생성해보세요
            </p>
          </div>
        ) : (
          subtitles.map((item) => {
            const isActive = currentTime >= item.startTime && currentTime < item.endTime;
            const isSelected = selectedId === item.id;
            const isEditing = editingId === item.id;
            const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.ENTERTAINMENT;

            return (
              <div
                key={item.id}
                className={`p-3 rounded-lg transition-all duration-200 cursor-pointer group ${isActive ? 'ring-1' : ''}`}
                style={{
                  background: isSelected ? 'hsl(185 100% 50% / 0.15)' : 
                    isActive ? `${config.color}15` : 'hsl(220 18% 8%)',
                  border: `1px solid ${isSelected ? 'hsl(185 100% 50%)' : 'transparent'}`
                }}
                onClick={() => {
                  if (!isEditing) {
                    onSelect(item.id);
                    onSeek(item.startTime); // 클릭하면 해당 시간으로 이동
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!isEditing) {
                    startEditing(item); // 더블클릭으로 편집 시작
                  }
                }}
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSeek(item.startTime); }}
                      className="text-xs font-mono transition-colors"
                      style={{ color: isActive ? config.color : 'hsl(215 20% 55%)' }}
                    >
                      {formatTime(item.startTime)}
                    </button>
                    
                    {isEditing ? (
                      <div className="flex gap-1">
                        {Object.entries(TYPE_CONFIG).filter(([k]) => k !== 'TRANSCRIPT').map(([key, cfg]) => (
                          <button
                            key={key}
                            onClick={(e) => { e.stopPropagation(); setEditType(key as SubtitleType); }}
                            className="text-xs px-2 py-1 rounded transition-all"
                            style={{ 
                              background: editType === key ? `${cfg.color}30` : 'hsl(220 18% 10%)',
                              color: editType === key ? cfg.color : 'hsl(215 20% 55%)',
                              border: editType === key ? `1px solid ${cfg.color}` : '1px solid transparent'
                            }}
                            title={`${cfg.label}로 변경`}
                          >
                            {cfg.icon} {cfg.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span 
                        className="text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80"
                        style={{ background: `${config.color}20`, color: config.color }}
                        onClick={(e) => { e.stopPropagation(); startEditing(item); }}
                        title="클릭하여 유형 변경"
                      >
                        {config.icon} {config.label}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEdit(item.id); }}
                          disabled={isRegenerating}
                          className="p-1 rounded flex items-center gap-1"
                          style={{ 
                            background: editType !== originalType ? 'hsl(330 80% 60% / 0.3)' : 'hsl(150 80% 50% / 0.2)', 
                            color: editType !== originalType ? 'hsl(330 80% 60%)' : 'hsl(150 80% 50%)' 
                          }}
                          title={editType !== originalType ? 'AI가 자막을 재생성합니다' : '저장'}
                        >
                          {isRegenerating ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {editType !== originalType && !isRegenerating && <span className="text-xs">AI</span>}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                          disabled={isRegenerating}
                          className="p-1 rounded"
                          style={{ background: 'hsl(220 15% 15%)', color: 'hsl(215 20% 55%)' }}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditing(item); }}
                          className="p-1.5 rounded hover:bg-white/10 transition-all"
                          style={{ color: 'hsl(185 100% 50%)' }}
                          title="수정 (더블클릭)"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                          className="p-1.5 rounded hover:bg-red-500/20 transition-all"
                          style={{ color: 'hsl(0 72% 60%)' }}
                          title="삭제"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 텍스트 */}
                {isEditing ? (
                  <textarea
                    value={editText}
                    onChange={(e) => {
                      setEditText(e.target.value);
                      setCursorPosition(e.target.selectionStart);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCursorPosition((e.target as HTMLTextAreaElement).selectionStart);
                    }}
                    onKeyDown={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      const pos = target.selectionStart;
                      
                      // 맨 앞에서 백스페이스 → 윗 자막과 합치기
                      if (e.key === 'Backspace' && pos === 0 && onMergeWithPrevious) {
                        e.preventDefault();
                        onUpdate(item.id, { text: editText }); // 현재 편집 저장
                        onMergeWithPrevious(item.id);
                        setEditingId(null);
                        return;
                      }
                      
                      // Shift+Enter → 저장
                      if (e.key === 'Enter' && e.shiftKey) {
                        e.preventDefault();
                        saveEdit(item.id);
                        return;
                      }
                      
                      // Enter → 현재 커서 위치에서 자막 분할 (중간에 있을 때만)
                      if (e.key === 'Enter' && !e.shiftKey && onSplitSubtitle) {
                        e.preventDefault();
                        // 커서가 맨 앞이나 맨 뒤면 저장만
                        if (pos <= 0 || pos >= editText.length) {
                          saveEdit(item.id);
                        } else {
                          // 중간이면 분할
                          onUpdate(item.id, { text: editText });
                          onSplitSubtitle(item.id, pos);
                          setEditingId(null);
                        }
                        return;
                      }
                      
                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    className="w-full p-2 rounded text-sm resize-none outline-none"
                    style={{
                      background: 'hsl(220 20% 6%)',
                      border: '1px solid hsl(185 100% 50%)',
                      color: 'hsl(210 40% 98%)',
                    }}
                    rows={2}
                    autoFocus
                    disabled={isRegenerating}
                    placeholder="Enter:분할 | Shift+Enter:저장 | 맨앞 Backspace:합치기"
                  />
                ) : (
                  <p 
                    className="text-sm cursor-text hover:underline decoration-dotted underline-offset-4" 
                    style={{ color: config.color }}
                    onClick={(e) => { e.stopPropagation(); startEditing(item); }}
                    title="클릭하여 수정"
                  >
                    {item.text}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
