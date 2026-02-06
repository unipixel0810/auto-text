'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SubtitleItem, SubtitleStyle } from '@/types/subtitle';

interface VideoPreviewProps {
  videoUrl: string | null;
  subtitles: SubtitleItem[];
  globalStyle: SubtitleStyle;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  selectedSubtitleId: string | null;
  onSelectSubtitle?: (id: string | null) => void;
  onSubtitleDrag?: (id: string, x: number, y: number) => void;
  onSubtitleResize?: (id: string, scale: number) => void;
  onSubtitleRotate?: (id: string, rotation: number) => void;
  onSubtitleDelete?: (id: string) => void;
  onSubtitleTextChange?: (id: string, text: string) => void;
  onSubtitleWidthChange?: (id: string, maxWidth: number) => void;
  seekTo?: number | null;
  onSeekComplete?: () => void;
}

// 자막 유형별 스타일
const TYPE_STYLES: Record<string, { bg: string; border: string; handleColor: string }> = {
  ENTERTAINMENT: { 
    bg: 'rgba(255, 220, 0, 0.95)', 
    border: '#FFB800',
    handleColor: '#FF6B00'
  },
  SITUATION: { 
    bg: 'rgba(130, 220, 255, 0.95)', 
    border: '#00BFFF',
    handleColor: '#0066FF'
  },
  EXPLANATION: { 
    bg: 'rgba(180, 255, 180, 0.95)', 
    border: '#50FF50',
    handleColor: '#00AA00'
  },
  TRANSCRIPT: { 
    bg: 'rgba(255, 255, 255, 0.95)', 
    border: '#CCCCCC',
    handleColor: '#666666'
  },
};

// 드래그 모드
type DragMode = 'none' | 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'resize-left' | 'resize-right' | 'rotate' | 'delete';

function getSubtitleStyle(subtitle: SubtitleItem, globalStyle: SubtitleStyle): SubtitleStyle {
  return { ...globalStyle, ...subtitle.style };
}

export default function VideoPreview({
  videoUrl,
  subtitles,
  globalStyle,
  currentTime,
  onTimeUpdate,
  selectedSubtitleId,
  onSelectSubtitle,
  onSubtitleDrag,
  onSubtitleResize,
  onSubtitleRotate,
  onSubtitleDelete,
  onSubtitleTextChange,
  onSubtitleWidthChange,
  seekTo,
  onSeekComplete,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 1920, height: 1080 });
  const [videoReady, setVideoReady] = useState(false);
  
  // 드래그 상태
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [initialSubtitlePos, setInitialSubtitlePos] = useState({ x: 0, y: 0 });
  const [initialMaxWidth, setInitialMaxWidth] = useState(80);
  
  // 텍스트 편집 상태
  const [editingSubtitleId, setEditingSubtitleId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editPosition, setEditPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // 외부에서 시간 이동 요청 처리
  useEffect(() => {
    if (seekTo !== null && seekTo !== undefined && videoRef.current) {
      videoRef.current.currentTime = seekTo;
      onSeekComplete?.();
    }
  }, [seekTo, onSeekComplete]);

  // 현재 시간에 표시할 자막 찾기 (무조건 하나만!)
  const activeSubtitles = (() => {
    // 현재 시간에 해당하는 AI 자막만 필터링
    const filtered = subtitles.filter((s) => {
      if (currentTime < s.startTime || currentTime >= s.endTime) return false;
      if (s.type === 'TRANSCRIPT') return false;
      if (!s.id.startsWith('ai_')) return false;
      return true;
    });
    
    if (filtered.length === 0) return [];
    
    // 선택된 자막이 있으면 그것만 표시
    if (selectedSubtitleId) {
      const selected = filtered.find(s => s.id === selectedSubtitleId);
      if (selected) return [selected];
    }
    
    // 아니면 마지막 하나만
    return filtered.slice(-1);
  })();

  // 자막 박스 정보 계산 (scale 적용, 자동 줄바꿈 지원)
  const getSubtitleBox = useCallback((subtitle: SubtitleItem, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, yOffset: number = 0) => {
    const style = getSubtitleStyle(subtitle, globalStyle);
    const scale = (style as any).scale || 1;
    // maxWidth: 사용자가 지정한 최대 너비 (퍼센트), 기본값 80%
    const userMaxWidth = (style as any).maxWidth || 80;
    
    // 폰트 크기에 scale 적용 (화면에 맞게 크게)
    const baseFontSize = Math.round(style.fontSize * (canvas.width / 1920) * 3.5);
    const scaledFontSize = baseFontSize * scale;
    
    ctx.font = `${style.fontWeight} ${scaledFontSize}px "${style.fontFamily}", "Noto Sans KR", sans-serif`;
    
    // 최대 너비 (사용자 설정 기반)
    const maxLineWidth = canvas.width * (userMaxWidth / 100);
    
    // 자동 줄바꿈 함수 (너비에 따라 유동적)
    const wrapText = (text: string): string[] => {
      const manualLines = text.split('\n');
      const wrappedLines: string[] = [];
      
      for (const line of manualLines) {
        const lineWidth = ctx.measureText(line).width;
        
        // 한 줄이 최대 너비를 넘으면 자동 줄바꿈
        if (lineWidth > maxLineWidth) {
          // 필요한 줄 수 계산
          const numLines = Math.ceil(lineWidth / maxLineWidth);
          const charCount = line.length;
          const charsPerLine = Math.ceil(charCount / numLines);
          
          let startIdx = 0;
          for (let i = 0; i < numLines && startIdx < charCount; i++) {
            let endIdx = Math.min(startIdx + charsPerLine, charCount);
            
            // 단어 중간에서 끊기지 않도록 조정 (마지막 줄 제외)
            if (i < numLines - 1 && endIdx < charCount) {
              for (let j = endIdx; j > startIdx + charsPerLine - 5 && j > startIdx; j--) {
                if (line[j] === ' ' || line[j] === ',' || line[j] === '.' || line[j] === '!' || line[j] === '?') {
                  endIdx = j + 1;
                  break;
                }
              }
            }
            
            const segment = line.slice(startIdx, endIdx).trim();
            if (segment) wrappedLines.push(segment);
            startIdx = endIdx;
          }
        } else {
          wrappedLines.push(line);
        }
      }
      
      return wrappedLines.filter(l => l.length > 0);
    };
    
    const lines = wrapText(subtitle.text);
    const lineHeight = scaledFontSize * 1.3;
    
    // 가장 긴 줄의 너비 계산
    let actualMaxWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      if (metrics.width > actualMaxWidth) actualMaxWidth = metrics.width;
    }
    
    const x = (style.x / 100) * canvas.width;
    // yOffset으로 여러 자막이 겹치지 않도록 위치 조정
    const y = (style.y / 100) * canvas.height - yOffset;
    const padX = scaledFontSize * 0.8;
    const padY = scaledFontSize * 0.4;
    
    // 전체 높이 = 줄 수 * 줄 높이
    const totalHeight = lines.length * lineHeight;
    
    return {
      x,
      y,
      width: actualMaxWidth + padX * 2,
      height: totalHeight + padY * 2,
      padX,
      padY,
      fontSize: scaledFontSize,
      textWidth: actualMaxWidth,
      rotation: (style as any).rotation || 0,
      scale: scale,
      maxWidth: userMaxWidth,
      maxLineWidth,
      lines,
      lineHeight,
    };
  }, [globalStyle]);

  // 자막 그리기
  const drawSubtitles = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    canvas.width = vw;
    canvas.height = vh;
    ctx.clearRect(0, 0, vw, vh);

    activeSubtitles.forEach((subtitle, index) => {
      const style = getSubtitleStyle(subtitle, globalStyle);
      const isSelected = subtitle.id === selectedSubtitleId;
      const typeStyle = TYPE_STYLES[subtitle.type] || TYPE_STYLES.TRANSCRIPT;
      
      // 여러 자막이 있을 때 위로 쌓이도록 yOffset 계산
      const yOffset = index * (canvas.height * 0.12); // 각 자막 간격
      const box = getSubtitleBox(subtitle, canvas, ctx, yOffset);

      ctx.save();
      
      // 회전만 적용 (scale은 fontSize에 이미 적용됨)
      ctx.translate(box.x, box.y);
      ctx.rotate((box.rotation * Math.PI) / 180);
      ctx.translate(-box.x, -box.y);

      // 배경색
      const bgColor = style.backgroundColor && style.backgroundColor !== 'transparent' 
        ? style.backgroundColor 
        : typeStyle.bg;
      
      // 박스 위치: 너비/높이 기준 중앙 정렬
      const boxX = box.x - box.width / 2;
      const boxY = box.y - box.height / 2;
      const borderRadius = box.fontSize * 0.3;

      // 배경 그리기
      if (style.backgroundColor !== 'transparent') {
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 5;
        
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, box.width, box.height, borderRadius);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 텍스트 (줄바꿈 지원)
      const textColor = style.color || '#000000';
      const textOutline = textColor === '#FFFFFF' ? '#000000' : '#FFFFFF';
      
      ctx.font = `${style.fontWeight} ${box.fontSize}px "${style.fontFamily}", "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.strokeStyle = textOutline;
      ctx.lineWidth = box.fontSize * 0.05;
      ctx.fillStyle = textColor;
      
      // 여러 줄 그리기
      const lines = box.lines || [subtitle.text];
      const lineHeight = box.lineHeight || box.fontSize * 1.3;
      const startY = box.y - ((lines.length - 1) * lineHeight) / 2;
      
      lines.forEach((line: string, lineIndex: number) => {
        const lineY = startY + lineIndex * lineHeight;
        ctx.strokeText(line, box.x, lineY);
        ctx.fillText(line, box.x, lineY);
      });

      ctx.restore();

      // 선택된 자막의 컨트롤 박스 그리기
      if (isSelected) {
        drawTransformBox(ctx, subtitle, box, typeStyle);
      }
    });
  }, [activeSubtitles, globalStyle, selectedSubtitleId, getSubtitleBox]);

  // Transform 컨트롤 박스 그리기
  const drawTransformBox = (
    ctx: CanvasRenderingContext2D, 
    subtitle: SubtitleItem, 
    box: ReturnType<typeof getSubtitleBox>,
    typeStyle: typeof TYPE_STYLES.ENTERTAINMENT
  ) => {
    // 박스 위치: 너비/높이 기준 중앙 정렬
    const boxX = box.x - box.width / 2;
    const boxY = box.y - box.height / 2;
    const handleSize = Math.max(16, box.fontSize * 0.3);
    
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.translate(-box.x, -box.y);

    // 바운딩 박스 (점선)
    ctx.strokeStyle = typeStyle.handleColor;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(boxX - 10, boxY - 10, box.width + 20, box.height + 20);
    ctx.setLineDash([]);

    // 코너 핸들 (크기 조절)
    const corners = [
      { x: boxX - 10, y: boxY - 10, cursor: 'nw-resize' },
      { x: boxX + box.width + 10, y: boxY - 10, cursor: 'ne-resize' },
      { x: boxX - 10, y: boxY + box.height + 10, cursor: 'sw-resize' },
      { x: boxX + box.width + 10, y: boxY + box.height + 10, cursor: 'se-resize' },
    ];

    corners.forEach((corner) => {
      // 핸들 외곽
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(corner.x - handleSize/2, corner.y - handleSize/2, handleSize, handleSize);
      
      // 핸들 내부
      ctx.fillStyle = typeStyle.handleColor;
      ctx.fillRect(corner.x - handleSize/2 + 3, corner.y - handleSize/2 + 3, handleSize - 6, handleSize - 6);
      
      // 핸들 테두리
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(corner.x - handleSize/2, corner.y - handleSize/2, handleSize, handleSize);
    });

    // 회전 핸들 (상단 중앙)
    const rotateHandleY = boxY - 40;
    const rotateHandleX = box.x;
    
    // 연결선
    ctx.strokeStyle = typeStyle.handleColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rotateHandleX, boxY - 10);
    ctx.lineTo(rotateHandleX, rotateHandleY + handleSize/2);
    ctx.stroke();
    
    // 회전 핸들 (원형)
    ctx.beginPath();
    ctx.arc(rotateHandleX, rotateHandleY, handleSize/2 + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = typeStyle.handleColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // 회전 아이콘
    ctx.fillStyle = typeStyle.handleColor;
    ctx.font = `${handleSize * 0.8}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↻', rotateHandleX, rotateHandleY);

    // 좌우 핸들 (너비 조절 - 줄바꿈 제어)
    const leftHandleX = boxX - 10;
    const rightHandleX = boxX + box.width + 10;
    const sideHandleY = boxY + box.height / 2;
    const sideHandleWidth = handleSize * 0.6;
    const sideHandleHeight = handleSize * 1.5;
    
    // 왼쪽 핸들 (가로 막대)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(leftHandleX - sideHandleWidth, sideHandleY - sideHandleHeight/2, sideHandleWidth, sideHandleHeight);
    ctx.fillStyle = '#FF9500'; // 오렌지색 (너비 조절 표시)
    ctx.fillRect(leftHandleX - sideHandleWidth + 2, sideHandleY - sideHandleHeight/2 + 2, sideHandleWidth - 4, sideHandleHeight - 4);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(leftHandleX - sideHandleWidth, sideHandleY - sideHandleHeight/2, sideHandleWidth, sideHandleHeight);
    
    // 오른쪽 핸들 (가로 막대)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(rightHandleX, sideHandleY - sideHandleHeight/2, sideHandleWidth, sideHandleHeight);
    ctx.fillStyle = '#FF9500';
    ctx.fillRect(rightHandleX + 2, sideHandleY - sideHandleHeight/2 + 2, sideHandleWidth - 4, sideHandleHeight - 4);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(rightHandleX, sideHandleY - sideHandleHeight/2, sideHandleWidth, sideHandleHeight);
    
    // 화살표 아이콘 (↔)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${handleSize * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀', leftHandleX - sideHandleWidth/2, sideHandleY);
    ctx.fillText('▶', rightHandleX + sideHandleWidth/2, sideHandleY);

    // 삭제 핸들 (오른쪽 상단)
    const deleteHandleX = boxX + box.width + 10;
    const deleteHandleY = boxY - 40;
    
    // 연결선
    ctx.strokeStyle = '#FF4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(deleteHandleX, boxY - 10);
    ctx.lineTo(deleteHandleX, deleteHandleY + handleSize/2);
    ctx.stroke();
    
    // 삭제 핸들 (원형, 빨간색)
    ctx.beginPath();
    ctx.arc(deleteHandleX, deleteHandleY, handleSize/2 + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#FF4444';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 휴지통 아이콘
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${handleSize * 0.7}px sans-serif`;
    ctx.fillText('🗑', deleteHandleX, deleteHandleY);

    ctx.restore();
  };

  // 클릭 위치로 드래그 모드 결정
  const getDragModeAtPosition = useCallback((clickX: number, clickY: number): { mode: DragMode; subtitleId: string | null } => {
    const canvas = canvasRef.current;
    if (!canvas) return { mode: 'none', subtitleId: null };
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return { mode: 'none', subtitleId: null };

    // 선택된 자막의 핸들 체크
    if (selectedSubtitleId) {
      const subtitle = activeSubtitles.find(s => s.id === selectedSubtitleId);
      if (subtitle) {
        const box = getSubtitleBox(subtitle, canvas, ctx);
        // 박스 위치: 너비/높이 기준 중앙 정렬
        const boxX = box.x - box.width / 2;
        const boxY = box.y - box.height / 2;
        const handleSize = Math.max(16, box.fontSize * 0.3);

        // 회전 핸들 체크
        const rotateHandleY = boxY - 40;
        if (Math.hypot(clickX - box.x, clickY - rotateHandleY) < handleSize) {
          return { mode: 'rotate', subtitleId: selectedSubtitleId };
        }

        // 삭제 핸들 체크
        const deleteHandleX = boxX + box.width + 10;
        const deleteHandleY = boxY - 40;
        if (Math.hypot(clickX - deleteHandleX, clickY - deleteHandleY) < handleSize) {
          return { mode: 'delete', subtitleId: selectedSubtitleId };
        }

        // 코너 핸들 체크
        const corners: { x: number; y: number; mode: DragMode }[] = [
          { x: boxX - 10, y: boxY - 10, mode: 'resize-tl' },
          { x: boxX + box.width + 10, y: boxY - 10, mode: 'resize-tr' },
          { x: boxX - 10, y: boxY + box.height + 10, mode: 'resize-bl' },
          { x: boxX + box.width + 10, y: boxY + box.height + 10, mode: 'resize-br' },
        ];

        for (const corner of corners) {
          if (Math.abs(clickX - corner.x) < handleSize && Math.abs(clickY - corner.y) < handleSize) {
            return { mode: corner.mode, subtitleId: selectedSubtitleId };
          }
        }

        // 좌우 핸들 체크 (너비 조절)
        const sideHandleY = boxY + box.height / 2;
        const sideHandleWidth = handleSize * 0.6;
        const sideHandleHeight = handleSize * 1.5;
        
        // 왼쪽 핸들
        const leftHandleX = boxX - 10;
        if (clickX >= leftHandleX - sideHandleWidth - 5 && clickX <= leftHandleX + 5 &&
            clickY >= sideHandleY - sideHandleHeight/2 - 5 && clickY <= sideHandleY + sideHandleHeight/2 + 5) {
          return { mode: 'resize-left', subtitleId: selectedSubtitleId };
        }
        
        // 오른쪽 핸들
        const rightHandleX = boxX + box.width + 10;
        if (clickX >= rightHandleX - 5 && clickX <= rightHandleX + sideHandleWidth + 5 &&
            clickY >= sideHandleY - sideHandleHeight/2 - 5 && clickY <= sideHandleY + sideHandleHeight/2 + 5) {
          return { mode: 'resize-right', subtitleId: selectedSubtitleId };
        }

        // 박스 내부 클릭 (이동)
        if (clickX >= boxX - 10 && clickX <= boxX + box.width + 10 &&
            clickY >= boxY - 10 && clickY <= boxY + box.height + 10) {
          return { mode: 'move', subtitleId: selectedSubtitleId };
        }
      }
    }

    // 다른 자막 클릭 체크
    for (const subtitle of activeSubtitles) {
      const box = getSubtitleBox(subtitle, canvas, ctx);
      // 박스 위치: 너비/높이 기준 중앙 정렬
      const boxX = box.x - box.width / 2;
      const boxY = box.y - box.height / 2;

      if (clickX >= boxX && clickX <= boxX + box.width &&
          clickY >= boxY && clickY <= boxY + box.height) {
        return { mode: 'move', subtitleId: subtitle.id };
      }
    }

    return { mode: 'none', subtitleId: null };
  }, [activeSubtitles, selectedSubtitleId, getSubtitleBox]);

  // 마우스 이벤트 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const { mode, subtitleId } = getDragModeAtPosition(clickX, clickY);
    
    if (subtitleId && mode !== 'none') {
      // 삭제 모드면 바로 삭제
      if (mode === 'delete') {
        onSubtitleDelete?.(subtitleId);
        onSelectSubtitle?.(null);
        return;
      }
      
      onSelectSubtitle?.(subtitleId);
      setDragMode(mode);
      setDragStartPos({ x: clickX, y: clickY });
      
      const subtitle = subtitles.find(s => s.id === subtitleId);
      if (subtitle) {
        const style = getSubtitleStyle(subtitle, globalStyle);
        setInitialSubtitlePos({ x: style.x, y: style.y });
        setInitialMaxWidth((style as any).maxWidth || 80);
      }
    } else {
      // 빈 공간 클릭 시 - 선택 해제하고 재생/일시정지 토글
      onSelectSubtitle?.(null);
      const video = videoRef.current;
      if (video) {
        if (video.paused) {
          video.play().catch(() => {
            video.muted = true;
            video.play();
          });
        } else {
          video.pause();
        }
      }
    }
  }, [getDragModeAtPosition, onSelectSubtitle, onSubtitleDelete, subtitles, globalStyle]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || dragMode === 'none' || !selectedSubtitleId) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const deltaX = mouseX - dragStartPos.x;
    const deltaY = mouseY - dragStartPos.y;

    if (dragMode === 'move') {
      const newX = initialSubtitlePos.x + (deltaX / canvas.width) * 100;
      const newY = initialSubtitlePos.y + (deltaY / canvas.height) * 100;
      onSubtitleDrag?.(selectedSubtitleId, 
        Math.max(5, Math.min(95, newX)), 
        Math.max(5, Math.min(95, newY))
      );
    } else if (dragMode === 'resize-left' || dragMode === 'resize-right') {
      // 좌우 너비 조절 (줄바꿈 제어)
      // 오른쪽으로 드래그하면 너비 증가 (1줄로), 왼쪽으로 드래그하면 너비 감소 (2-3줄로)
      const widthDelta = (deltaX / canvas.width) * 100;
      const direction = dragMode === 'resize-right' ? 1 : -1;
      const newMaxWidth = initialMaxWidth + widthDelta * direction;
      // 최소 20%, 최대 100%
      onSubtitleWidthChange?.(selectedSubtitleId, Math.max(20, Math.min(100, newMaxWidth)));
    } else if (dragMode.startsWith('resize-t') || dragMode.startsWith('resize-b')) {
      // 코너 핸들: 전체 크기(scale) 조절
      const distance = Math.hypot(deltaX, deltaY);
      const scale = 1 + (distance / 200) * (deltaX > 0 || deltaY > 0 ? 1 : -1);
      // 최소 0.2배, 최대 무제한
      onSubtitleResize?.(selectedSubtitleId, Math.max(0.2, scale));
    } else if (dragMode === 'rotate') {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const subtitle = subtitles.find(s => s.id === selectedSubtitleId);
        if (subtitle) {
          const box = getSubtitleBox(subtitle, canvas, ctx);
          const angle = Math.atan2(mouseY - box.y, mouseX - box.x) * (180 / Math.PI) + 90;
          onSubtitleRotate?.(selectedSubtitleId, angle);
        }
      }
    }
  }, [dragMode, dragStartPos, initialSubtitlePos, initialMaxWidth, selectedSubtitleId, onSubtitleDrag, onSubtitleResize, onSubtitleRotate, onSubtitleWidthChange, subtitles, getSubtitleBox]);

  const handleMouseUp = useCallback(() => {
    setDragMode('none');
  }, []);

  // 더블클릭 - 텍스트 편집 시작
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 클릭된 자막 찾기
    for (const subtitle of activeSubtitles) {
      const box = getSubtitleBox(subtitle, canvas, ctx);
      // 박스 위치: 너비/높이 기준 중앙 정렬
      const boxX = box.x - box.width / 2;
      const boxY = box.y - box.height / 2;

      if (clickX >= boxX && clickX <= boxX + box.width &&
          clickY >= boxY && clickY <= boxY + box.height) {
        // 편집 모드 시작
        setEditingSubtitleId(subtitle.id);
        setEditText(subtitle.text);
        
        // 화면상 위치 계산 (container 기준)
        const displayX = (boxX / canvas.width) * rect.width;
        const displayY = (boxY / canvas.height) * rect.height;
        const displayWidth = (box.width / canvas.width) * rect.width;
        const displayHeight = (box.height / canvas.height) * rect.height;
        
        setEditPosition({
          x: displayX,
          y: displayY,
          width: Math.max(displayWidth, 150),
          height: Math.max(displayHeight, 50)
        });
        
        // 다음 틱에서 포커스
        setTimeout(() => textareaRef.current?.focus(), 50);
        break;
      }
    }
  }, [activeSubtitles, getSubtitleBox]);

  // 텍스트 편집 완료
  const finishEditing = useCallback(() => {
    if (editingSubtitleId && editText.trim()) {
      onSubtitleTextChange?.(editingSubtitleId, editText);
    }
    setEditingSubtitleId(null);
    setEditText('');
  }, [editingSubtitleId, editText, onSubtitleTextChange]);

  // 텍스트 편집 취소
  const cancelEditing = useCallback(() => {
    setEditingSubtitleId(null);
    setEditText('');
  }, []);

  // 키 입력 처리
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      cancelEditing();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Shift+Enter는 줄바꿈, Enter만은 저장
      // 단, 줄바꿈을 허용하려면 저장 안함
    }
  }, [cancelEditing]);

  // 비디오 이벤트
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => onTimeUpdate(video.currentTime);
    const handleLoadedMetadata = () => {
      console.log('✅ 비디오 메타데이터 로드:', video.videoWidth, 'x', video.videoHeight);
      setDuration(video.duration);
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    };
    const handleCanPlay = () => {
      console.log('✅ 비디오 재생 준비 완료');
      setVideoReady(true);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => console.error('❌ 비디오 에러:', video.error?.message);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
    };
  }, [onTimeUpdate]);

  // 자막 다시 그리기
  useEffect(() => {
    drawSubtitles();
  }, [drawSubtitles]);

  // 재생 중 애니메이션
  useEffect(() => {
    if (!isPlaying) return;
    let animationId: number;
    const animate = () => {
      drawSubtitles();
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, drawSubtitles]);

  // 재생 토글
  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPlaying) {
        video.pause();
      } else {
        // muted 상태로 먼저 재생 시도 (autoplay 정책 우회)
        video.muted = false;
        await video.play();
      }
    } catch (err) {
      console.error('재생 오류, muted로 재시도:', err);
      try {
        video.muted = true;
        await video.play();
        // 재생 시작 후 muted 해제
        setTimeout(() => { video.muted = false; }, 100);
      } catch (e) {
        console.error('재생 실패:', e);
      }
    }
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 커서 스타일 결정
  const getCursorStyle = () => {
    if (dragMode === 'move') return 'grabbing';
    if (dragMode === 'rotate') return 'crosshair';
    if (dragMode === 'resize-left' || dragMode === 'resize-right') return 'ew-resize';
    if (dragMode.startsWith('resize')) return `${dragMode.replace('resize-', '')}-resize`;
    return 'default';
  };

  if (!videoUrl) {
    return (
      <div 
        className="w-full rounded-xl flex items-center justify-center"
        style={{ aspectRatio: '16/9', background: 'hsl(220 18% 6%)', border: '1px solid hsl(220 15% 18%)' }}
      >
        <p style={{ color: 'hsl(215 20% 45%)' }}>비디오를 업로드하세요</p>
      </div>
    );
  }

  // 터치 이벤트 핸들러 (모바일)
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const syntheticEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => e.stopPropagation(),
    } as React.MouseEvent<HTMLCanvasElement>;
    handleMouseDown(syntheticEvent);
  }, [handleMouseDown]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const syntheticEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
    } as React.MouseEvent<HTMLCanvasElement>;
    handleMouseMove(syntheticEvent);
  }, [handleMouseMove]);

  const handleTouchEnd = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  return (
    <div className="flex flex-col gap-3">
      {/* 비디오 + 캔버스 */}
      <div 
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden"
        style={{ 
          aspectRatio: `${videoSize.width}/${videoSize.height}`,
          minHeight: '200px',
          maxHeight: '70vh',
          background: '#000', 
          border: '2px solid hsl(220 15% 20%)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
        }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'contain' }}
          playsInline
          webkit-playsinline="true"
          preload="auto"
          muted={false}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: getCursorStyle(), objectFit: 'contain', touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        
        {/* 텍스트 편집 오버레이 */}
        {editingSubtitleId && (
          <div 
            className="absolute"
            style={{
              left: editPosition.x,
              top: editPosition.y,
              width: editPosition.width,
              minHeight: editPosition.height,
            }}
          >
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={handleKeyDown}
              className="w-full h-full p-2 rounded-lg resize-none outline-none"
              style={{
                background: 'rgba(0, 0, 0, 0.85)',
                color: '#FFFFFF',
                border: '2px solid hsl(185 100% 50%)',
                fontSize: '14px',
                fontFamily: 'inherit',
                minHeight: `${editPosition.height}px`,
                boxShadow: '0 4px 20px rgba(0, 200, 255, 0.3)',
              }}
              placeholder="자막 입력... (Shift+Enter: 줄바꿈)"
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={finishEditing}
                className="px-2 py-1 text-xs rounded"
                style={{ background: 'hsl(185 100% 50%)', color: '#000' }}
              >
                ✓ 저장
              </button>
              <button
                onClick={cancelEditing}
                className="px-2 py-1 text-xs rounded"
                style={{ background: 'hsl(0 60% 50%)', color: '#FFF' }}
              >
                ✕ 취소
              </button>
            </div>
          </div>
        )}
        
        {/* 로딩 상태 표시 */}
        {!videoReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-2 text-white">
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              로딩 중...
            </div>
          </div>
        )}
        
        {/* 재생/일시정지 버튼 - 중앙에 작게 배치 (자막 클릭 방해 안 함) */}
        {videoReady && !editingSubtitleId && !isPlaying && !selectedSubtitleId && (
          <button
            onClick={togglePlay}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{ 
              background: 'rgba(0, 200, 255, 0.9)',
              boxShadow: '0 4px 30px rgba(0, 200, 255, 0.5)'
            }}
          >
            <svg className="w-8 h-8 ml-1" fill="#000" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
      </div>

      {/* 해상도 표시 */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-mono" style={{ color: 'hsl(215 20% 45%)' }}>
          📐 {videoSize.width} × {videoSize.height}
        </span>
        <span className="text-xs px-2 py-0.5 rounded" style={{ 
          background: videoReady ? 'hsl(150 80% 40% / 0.2)' : 'hsl(45 80% 50% / 0.2)', 
          color: videoReady ? 'hsl(150 80% 50%)' : 'hsl(45 80% 60%)'
        }}>
          {videoReady ? '✓ 준비됨' : '⏳ 로딩...'}
        </span>
      </div>

      {/* 컨트롤 바 */}
      <div className="p-4 rounded-xl" style={{ background: 'hsl(220 18% 8%)', border: '1px solid hsl(220 15% 18%)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            disabled={!videoReady}
            className="p-3 rounded-xl transition-all hover:scale-105 disabled:opacity-50"
            style={{ 
              background: 'linear-gradient(135deg, hsl(185 100% 50%), hsl(200 100% 45%))', 
              color: '#000',
              boxShadow: '0 4px 15px rgba(0, 200, 255, 0.3)'
            }}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <span className="text-sm font-mono min-w-[45px]" style={{ color: 'hsl(185 100% 50%)' }}>
            {formatTime(currentTime)}
          </span>

          <div className="flex-1">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ 
                background: `linear-gradient(to right, hsl(185 100% 50%) ${(currentTime / (duration || 1)) * 100}%, hsl(220 15% 20%) ${(currentTime / (duration || 1)) * 100}%)`
              }}
            />
          </div>

          <span className="text-sm font-mono min-w-[45px]" style={{ color: 'hsl(215 20% 65%)' }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
