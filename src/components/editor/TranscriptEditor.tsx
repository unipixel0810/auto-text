'use client';

import React, { useCallback } from 'react';
import type { TranscriptItem } from '@/types/subtitle';

interface TranscriptEditorProps {
  transcripts: TranscriptItem[];
  currentTime: number;
  onUpdate: (id: string, editedText: string) => void;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function TranscriptEditor({
  transcripts,
  currentTime,
  onUpdate,
  onSeek,
}: TranscriptEditorProps) {
  // 텍스트 변경 시 자동 저장
  const handleTextChange = useCallback((id: string, newText: string) => {
    onUpdate(id, newText);
  }, [onUpdate]);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid hsl(220 15% 18%)' }}>
        <div className="w-1 h-5 rounded-full" style={{ background: 'hsl(185 100% 50%)' }} />
        <h3 className="font-semibold" style={{ color: 'hsl(210 40% 98%)' }}>원본 대본</h3>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
          background: 'hsl(185 100% 50% / 0.1)', 
          color: 'hsl(185 100% 50%)' 
        }}>
          자동 저장
        </span>
      </div>

      {/* 대본 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {transcripts.map((item) => {
          const isActive = currentTime >= item.startTime && currentTime < item.endTime;

          return (
            <div
              key={item.id}
              className={`p-3 rounded-lg transition-all duration-200 cursor-pointer hover:bg-opacity-80 ${isActive ? 'ring-1' : ''}`}
              style={{
                background: isActive ? 'hsl(185 100% 50% / 0.1)' : 'hsl(220 18% 8%)',
                borderColor: isActive ? 'hsl(185 100% 50%)' : 'transparent'
              }}
              onClick={() => onSeek(item.startTime)}
            >
              {/* 시간 */}
              <div
                className="text-xs font-mono mb-2 transition-colors"
                style={{ color: isActive ? 'hsl(185 100% 50%)' : 'hsl(215 20% 55%)' }}
              >
                {formatTime(item.startTime)} - {formatTime(item.endTime)}
              </div>

              {/* 편집 가능한 텍스트 영역 */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={item.editedText || item.originalText}
                  onChange={(e) => handleTextChange(item.id, e.target.value)}
                  className="w-full p-2 rounded-lg text-sm resize-none outline-none transition-all"
                  style={{
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: item.isEdited ? 'hsl(150 80% 60%)' : 'hsl(210 40% 90%)',
                  }}
                  onFocus={(e) => {
                    e.target.style.background = 'hsl(220 20% 6%)';
                    e.target.style.borderColor = 'hsl(185 100% 50%)';
                  }}
                  onBlur={(e) => {
                    e.target.style.background = 'transparent';
                    e.target.style.borderColor = 'transparent';
                  }}
                  rows={2}
                />
                {item.isEdited && (
                  <span 
                    className="absolute right-2 top-2 w-2 h-2 rounded-full" 
                    style={{ background: 'hsl(150 80% 50%)' }} 
                    title="수정됨"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
