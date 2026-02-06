/**
 * Canvas + MediaRecorder 기반 비디오 렌더링 서비스
 * 자막이 입혀진 최종 영상을 생성
 */

import type { SubtitleItem, SubtitleStyle, SubtitleType } from '@/types/subtitle';

// ============================================
// 타입 정의
// ============================================

export interface RenderProgress {
  stage: 'loading' | 'preparing' | 'rendering' | 'encoding' | 'complete';
  progress: number;
  message: string;
}

export interface RenderOptions {
  videoFile: File;
  subtitles: SubtitleItem[];
  globalStyle: SubtitleStyle;
  outputFormat: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high';
}

// ============================================
// SRT 내보내기 (기존 기능 유지)
// ============================================

export function generateSRT(subtitles: SubtitleItem[]): string {
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const typeLabels: Record<SubtitleType, string> = {
    ENTERTAINMENT: '예능',
    SITUATION: '상황',
    EXPLANATION: '설명',
    TRANSCRIPT: '말',
  };

  return subtitles.map((s, i) => 
    `${i + 1}\n${formatTime(s.startTime)} --> ${formatTime(s.endTime)}\n[${typeLabels[s.type]}] ${s.text}\n`
  ).join('\n');
}

// ============================================
// Canvas + MediaRecorder 렌더링
// ============================================

function getSubtitleStyle(subtitle: SubtitleItem, globalStyle: SubtitleStyle): SubtitleStyle {
  return { ...globalStyle, ...subtitle.style };
}

function drawSubtitleOnCanvas(
  ctx: CanvasRenderingContext2D,
  subtitle: SubtitleItem,
  globalStyle: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): void {
  const style = getSubtitleStyle(subtitle, globalStyle);
  const scale = (style as any).scale || 1;
  const rotation = (style as any).rotation || 0;
  
  const x = (style.x / 100) * canvasWidth;
  const y = (style.y / 100) * canvasHeight;
  
  // 폰트 크기에 scale 적용
  const scaledFontSize = style.fontSize * scale;

  ctx.font = `${style.fontWeight} ${scaledFontSize}px ${style.fontFamily}`;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = 'middle';

  // 최대 너비 (화면 너비의 80%)
  const maxLineWidth = canvasWidth * 0.8;
  
  // 자동 줄바꿈 함수 (최대 3줄까지)
  const wrapText = (text: string): string[] => {
    const manualLines = text.split('\n');
    const wrappedLines: string[] = [];
    
    for (const line of manualLines) {
      const lineWidth = ctx.measureText(line).width;
      
      if (lineWidth > maxLineWidth) {
        const charCount = line.length;
        
        // 3줄로 나눠야 할 정도로 긴 경우
        if (lineWidth > maxLineWidth * 1.8) {
          const part1End = Math.ceil(charCount / 3);
          const part2End = Math.ceil((charCount * 2) / 3);
          
          wrappedLines.push(line.slice(0, part1End).trim());
          wrappedLines.push(line.slice(part1End, part2End).trim());
          wrappedLines.push(line.slice(part2End).trim());
        } else {
          // 2줄로 나누기
          const midPoint = Math.ceil(charCount / 2);
          let breakPoint = midPoint;
          
          for (let i = midPoint; i >= midPoint - 5 && i > 0; i--) {
            if (line[i] === ' ' || line[i] === ',' || line[i] === '.' || line[i] === '!' || line[i] === '?') {
              breakPoint = i + 1;
              break;
            }
          }
          
          wrappedLines.push(line.slice(0, breakPoint).trim());
          wrappedLines.push(line.slice(breakPoint).trim());
        }
      } else {
        wrappedLines.push(line);
      }
    }
    
    return wrappedLines.filter(l => l.length > 0);
  };

  // 자동 줄바꿈 적용
  const lines = wrapText(subtitle.text);
  const lineHeight = scaledFontSize * 1.3;
  
  // 가장 긴 줄의 너비 계산
  let maxWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    if (metrics.width > maxWidth) maxWidth = metrics.width;
  }
  
  const totalHeight = lines.length * lineHeight;

  // 회전 적용
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-x, -y);

  // 그림자
  ctx.shadowColor = style.shadowColor;
  ctx.shadowOffsetX = style.shadowOffsetX;
  ctx.shadowOffsetY = style.shadowOffsetY;
  ctx.shadowBlur = style.shadowBlur;

  // 배경
  if (style.backgroundColor !== 'transparent') {
    const padding = scaledFontSize * 0.4;
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(
      x - maxWidth / 2 - padding,
      y - totalHeight / 2 - padding / 2,
      maxWidth + padding * 2,
      totalHeight + padding
    );
  }

  // 여러 줄 그리기
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  
  lines.forEach((line, lineIndex) => {
    const lineY = startY + lineIndex * lineHeight;
    
    // 테두리
    if (style.strokeWidth > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeText(line, x, lineY);
    }

    // 텍스트
    ctx.fillStyle = style.color;
    ctx.fillText(line, x, lineY);
  });

  ctx.restore();

  // 그림자 리셋
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 0;
}

export async function renderVideoWithSubtitles(
  options: RenderOptions,
  onProgress?: (p: RenderProgress) => void,
  abortSignal?: AbortSignal
): Promise<Blob> {
  const { videoFile, subtitles, globalStyle } = options;

  return new Promise((resolve, reject) => {
    let video: HTMLVideoElement | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let audioCtx: AudioContext | null = null;
    let cancelled = false;

    // 취소 처리
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        cancelled = true;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        if (video) {
          video.pause();
          URL.revokeObjectURL(video.src);
        }
        if (audioCtx) {
          audioCtx.close();
        }
        reject(new Error('렌더링이 취소되었습니다.'));
      });
    }

    try {
      onProgress?.({ stage: 'preparing', progress: 0, message: '비디오 로딩 중...' });

      // 비디오 요소 생성
      video = document.createElement('video');
      video.src = URL.createObjectURL(videoFile);
      video.muted = true;

      video.onloadedmetadata = async () => {
        if (!video) return;
        const width = video.videoWidth;
        const height = video.videoHeight;
        const duration = video.duration;

        // Canvas 생성
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // MediaRecorder 설정
        const stream = canvas.captureStream(30);
        
        // 취소 확인
        if (cancelled) return;

        // 오디오 트랙 추가 (녹음만, 스피커 출력 안함)
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        // source.connect(audioCtx.destination); // 스피커 출력 제거
        
        dest.stream.getAudioTracks().forEach(track => {
          stream.addTrack(track);
        });

        mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 5000000,
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          if (cancelled) return; // 취소된 경우 무시
          onProgress?.({ stage: 'complete', progress: 100, message: '렌더링 완료!' });
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (video) URL.revokeObjectURL(video.src);
          resolve(blob);
        };

        // 렌더링 루프
        const renderFrame = () => {
          if (cancelled || !video || !mediaRecorder) return;
          
          if (video.ended || video.paused) {
            mediaRecorder.stop();
            return;
          }

          // 비디오 프레임 그리기
          ctx.drawImage(video, 0, 0, width, height);

          // 현재 시간에 해당하는 자막 그리기
          const currentTime = video.currentTime;
          const activeSubtitles = subtitles.filter(
            s => currentTime >= s.startTime && currentTime < s.endTime
          );

          activeSubtitles.forEach(subtitle => {
            drawSubtitleOnCanvas(ctx, subtitle, globalStyle, width, height);
          });

          // 진행률 업데이트
          const progress = Math.round((currentTime / duration) * 100);
          onProgress?.({ 
            stage: 'rendering', 
            progress, 
            message: `렌더링 중... ${progress}%` 
          });

          requestAnimationFrame(renderFrame);
        };

        onProgress?.({ stage: 'rendering', progress: 0, message: '렌더링 시작...' });
        
        mediaRecorder.start();
        video.muted = false; // AudioContext 녹음용 (스피커 출력은 위에서 제거함)
        await video.play();
        renderFrame();
      };

      video.onerror = () => {
        reject(new Error('비디오 로드 실패'));
      };

    } catch (error) {
      reject(error);
    }
  });
}

// ============================================
// 다운로드 유틸리티
// ============================================

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSRT(subtitles: SubtitleItem[], filename: string = 'subtitles.srt'): void {
  const content = generateSRT(subtitles);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
}
