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

  return subtitles.map((s, i) => 
    `${i + 1}\n${formatTime(s.startTime)} --> ${formatTime(s.endTime)}\n${s.text}\n`
  ).join('\n');
}

// ============================================
// ASS 파일 생성 (캡컷 호환)
// ============================================

// RGB HEX를 ASS BGR 형식으로 변환 (&H00BBGGRR)
function rgbToAssBgr(hex: string): string {
  const cleanHex = (hex || '#FFFFFF').replace('#', '').toUpperCase();
  
  // 유효성 검사
  if (cleanHex.length !== 6 || !/^[0-9A-F]{6}$/.test(cleanHex)) {
    console.warn('Invalid hex color:', hex, '- using white');
    return '&H00FFFFFF';
  }
  
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  
  return `&H00${b}${g}${r}`;
}

// 폰트 이름 매핑 (한글 → 캡컷 호환 영문)
const FONT_NAME_MAP: Record<string, string> = {
  // 한글 폰트 → 안전한 영문 대체
  'PaperlogyExtraBold': 'Arial Black',
  'Paperlogy 8 ExtraBold': 'Arial Black',
  'PaperlogyBold': 'Arial Bold',
  'Paperlogy 7 Bold': 'Arial Bold',
  'TMONBlack': 'Impact',
  'TMON몬소리 Black': 'Impact',
  'TMONRegular': 'Arial',
  'TMON몬소리 Regular': 'Arial',
  'PresentationBold': 'Verdana Bold',
  '프레젠테이션체 Bold': 'Verdana Bold',
  'PresentationRegular': 'Verdana',
  '프레젠테이션체 Regular': 'Verdana',
  // 기본값
  'default': 'Arial',
};

// 이모지 제거 함수 (선택적 사용)
function removeEmoji(text: string): string {
  // 이모지 및 특수 유니코드 문자 제거 (ES5 호환)
  return text
    .split('')
    .filter(char => {
      const code = char.charCodeAt(0);
      // 기본 다국어 평면 내 일반 문자만 허용 (이모지 및 서로게이트 쌍 제외)
      return code < 0xD800 || (code > 0xDFFF && code < 0xFE00);
    })
    .join('');
}

// ASS 옵션 타입
export interface ASSOptions {
  width?: number;       // 영상 가로 해상도
  height?: number;      // 영상 세로 해상도
  removeEmojis?: boolean; // 이모지 제거 여부
  useEnglishFonts?: boolean; // 영문 폰트 사용 여부 (캡컷 호환)
}

// ASS 형식 내보내기 (캡컷 호환 버전)
export function generateASS(
  subtitles: SubtitleItem[], 
  globalStyle?: SubtitleStyle,
  options?: ASSOptions
): string {
  const {
    width = 1920,  // 기본값: 16:9 가로
    height = 1080, // 기본값: 16:9 세로
    removeEmojis = false,
    useEnglishFonts = true, // 캡컷 호환을 위해 기본 true
  } = options || {};

  // 타임스탬프 포맷 (검증 포함)
  const formatTime = (seconds: number) => {
    // 음수나 NaN 방지
    const safeSeconds = Math.max(0, seconds || 0);
    
    const h = Math.floor(safeSeconds / 3600);
    const m = Math.floor((safeSeconds % 3600) / 60);
    const s = Math.floor(safeSeconds % 60);
    const cs = Math.round((safeSeconds % 1) * 100);
    
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  // 폰트명 변환 (캡컷 호환)
  const getFontName = (fontFamily?: string): string => {
    if (!fontFamily) return 'Arial';
    if (useEnglishFonts) {
      return FONT_NAME_MAP[fontFamily] || FONT_NAME_MAP['default'];
    }
    return fontFamily;
  };

  // 각 자막별 스타일 생성
  const styles: string[] = [];
  const styleMap = new Map<string, string>();
  
  subtitles.forEach((subtitle) => {
    const style = { ...globalStyle, ...subtitle.style };
    
    const fontName = getFontName(style?.fontFamily);
    const fontSize = style?.fontSize || 50;
    const primaryColor = rgbToAssBgr(style?.color || '#FFFFFF');
    const outlineColor = rgbToAssBgr(style?.strokeColor || '#000000');
    // BackColour: 완전 투명 (캡컷 호환)
    const backColor = '&H00000000';
    // Bold: -1 = 자동, 0 = 끔, 1 = 켬
    const bold = (style?.fontWeight || 700) >= 700 ? -1 : 0;
    // Outline, Shadow 값 조정 (가독성 향상)
    const outline = Math.max(3, style?.strokeWidth || 3);
    const shadow = 2;
    
    // 스타일 고유 키
    const styleKey = `${fontName}-${fontSize}-${primaryColor}-${outlineColor}-${bold}`;
    
    if (!styleMap.has(styleKey)) {
      const styleName = `Style${styleMap.size + 1}`;
      styleMap.set(styleKey, styleName);
      
      // ASS 스타일 라인 (캡컷 호환 형식)
      styles.push(
        `Style: ${styleName},${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold},0,0,0,100,100,0,0,1,${outline},${shadow},2,10,10,50,1`
      );
    }
  });

  // 스타일이 없으면 기본 스타일 추가
  if (styles.length === 0) {
    styles.push('Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,2,2,10,10,50,1');
  }

  // ASS 헤더 (캡컷 호환)
  const header = `[Script Info]
Title: Subtitles
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // 이벤트(자막) 생성
  const events = subtitles.map((subtitle) => {
    const style = { ...globalStyle, ...subtitle.style };
    
    const fontName = getFontName(style?.fontFamily);
    const fontSize = style?.fontSize || 50;
    const primaryColor = rgbToAssBgr(style?.color || '#FFFFFF');
    const outlineColor = rgbToAssBgr(style?.strokeColor || '#000000');
    const bold = (style?.fontWeight || 700) >= 700 ? -1 : 0;
    
    const styleKey = `${fontName}-${fontSize}-${primaryColor}-${outlineColor}-${bold}`;
    const styleName = styleMap.get(styleKey) || 'Default';
    
    // 텍스트 처리 (이모지 제거 옵션)
    let text = subtitle.text.replace(/\n/g, '\\N');
    if (removeEmojis) {
      text = removeEmoji(text);
    }
    
    return `Dialogue: 0,${formatTime(subtitle.startTime)},${formatTime(subtitle.endTime)},${styleName},,0,0,0,,${text}`;
  }).join('\n');

  return header + events;
}

// ASS 다운로드 (UTF-8 BOM 포함 - 캡컷 호환)
export function downloadASS(
  subtitles: SubtitleItem[], 
  filename: string = 'subtitles.ass', 
  style?: SubtitleStyle,
  options?: ASSOptions
): void {
  const content = generateASS(subtitles, style, options);
  // UTF-8 BOM (\ufeff) 추가하여 캡컷에서 인식 가능하도록 함
  const blob = new Blob(['\ufeff' + content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
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

  // 최대 너비 (화면 너비의 92% — 여백 최소화하여 1줄 유지)
  const maxLineWidth = canvasWidth * 0.92;
  
  // 1줄 강제 (줄바꿈 제거, 넘치면 말줄임)
  const singleLine = subtitle.text.replace(/\n/g, ' ').trim();
  const lineWidth = ctx.measureText(singleLine).width;
  let displayText = singleLine;
  if (lineWidth > maxLineWidth) {
    // 글자를 하나씩 줄여가며 맞추기
    for (let i = singleLine.length - 1; i > 0; i--) {
      const truncated = singleLine.slice(0, i) + '...';
      if (ctx.measureText(truncated).width <= maxLineWidth) {
        displayText = truncated;
        break;
      }
    }
  }
  const lines = [displayText];
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

// TXT 다운로드 (시간 없이 텍스트만)
export function downloadTXT(subtitles: SubtitleItem[], filename: string = 'subtitles.txt'): void {
  const content = subtitles.map(s => s.text).join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
}

// ============================================
// FFmpeg.wasm 기반 고품질 렌더링
// ============================================

let ffmpegInstance: any = null;
let ffmpegLoaded = false;

// FFmpeg 인스턴스 로드
async function getFFmpeg(): Promise<any> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');

  ffmpegInstance = new FFmpeg();

  // FFmpeg core 로드
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegLoaded = true;
  return ffmpegInstance;
}

// FFmpeg로 비디오에 자막 번인
export async function renderVideoWithFFmpeg(
  options: RenderOptions,
  onProgress?: (p: RenderProgress) => void,
  abortSignal?: AbortSignal
): Promise<Blob> {
  const { videoFile, subtitles, globalStyle, outputFormat = 'mp4', quality = 'high' } = options;

  try {
    // 1단계: FFmpeg 로드
    onProgress?.({ stage: 'loading', progress: 0, message: 'FFmpeg 로딩 중...' });
    
    const ffmpeg = await getFFmpeg();
    
    if (abortSignal?.aborted) {
      throw new Error('렌더링이 취소되었습니다.');
    }

    // 진행률 콜백 설정
    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      const percent = Math.round(progress * 100);
      onProgress?.({ stage: 'rendering', progress: percent, message: `렌더링 중... ${percent}%` });
    });

    // 2단계: 파일 준비
    onProgress?.({ stage: 'preparing', progress: 10, message: '파일 준비 중...' });
    
    const { fetchFile } = await import('@ffmpeg/util');
    
    // 비디오 해상도 가져오기
    const videoElement = document.createElement('video');
    const videoUrl = URL.createObjectURL(videoFile);
    videoElement.src = videoUrl;
    
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
      videoElement.onloadedmetadata = () => {
        resolve({ width: videoElement.videoWidth, height: videoElement.videoHeight });
        URL.revokeObjectURL(videoUrl);
      };
      videoElement.onerror = () => {
        resolve({ width: 1920, height: 1080 }); // 기본값
        URL.revokeObjectURL(videoUrl);
      };
    });
    
    // 비디오 파일 쓰기
    const videoData = await fetchFile(videoFile);
    await ffmpeg.writeFile('input.mp4', videoData);

    // ASS 자막 파일 생성 및 쓰기 (영상 해상도 반영)
    const assContent = generateASS(subtitles, globalStyle, {
      width,
      height,
      useEnglishFonts: false, // FFmpeg는 시스템 폰트 사용 가능
      removeEmojis: false,
    });
    const encoder = new TextEncoder();
    await ffmpeg.writeFile('subtitle.ass', encoder.encode(assContent));

    if (abortSignal?.aborted) {
      throw new Error('렌더링이 취소되었습니다.');
    }

    // 3단계: FFmpeg 실행
    onProgress?.({ stage: 'rendering', progress: 20, message: '렌더링 시작...' });

    // 품질 설정
    const qualityPresets: Record<string, string[]> = {
      low: ['-crf', '28', '-preset', 'ultrafast'],
      medium: ['-crf', '23', '-preset', 'fast'],
      high: ['-crf', '18', '-preset', 'medium'],
    };

    const qualityArgs = qualityPresets[quality] || qualityPresets.medium;
    const outputFile = `output.${outputFormat}`;

    // FFmpeg 명령어 실행
    // ass 필터로 자막 번인
    await ffmpeg.exec([
      '-i', 'input.mp4',
      '-vf', 'ass=subtitle.ass',
      '-c:a', 'copy',
      '-c:v', 'libx264',
      ...qualityArgs,
      '-y',
      outputFile
    ]);

    if (abortSignal?.aborted) {
      throw new Error('렌더링이 취소되었습니다.');
    }

    // 4단계: 결과 읽기
    onProgress?.({ stage: 'encoding', progress: 90, message: '파일 생성 중...' });
    
    const data = await ffmpeg.readFile(outputFile);
    
    // 임시 파일 정리
    await ffmpeg.deleteFile('input.mp4');
    await ffmpeg.deleteFile('subtitle.ass');
    await ffmpeg.deleteFile(outputFile);

    onProgress?.({ stage: 'complete', progress: 100, message: '렌더링 완료!' });

    const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
    return new Blob([data], { type: mimeType });

  } catch (error) {
    if ((error as Error).message.includes('취소')) {
      throw error;
    }
    console.error('FFmpeg 렌더링 실패:', error);
    throw new Error('FFmpeg 렌더링에 실패했습니다. Canvas 렌더링을 사용해주세요.');
  }
}

// FFmpeg 사용 가능 여부 확인
export async function checkFFmpegSupport(): Promise<boolean> {
  try {
    // SharedArrayBuffer 지원 확인 (FFmpeg.wasm 필수)
    if (typeof SharedArrayBuffer === 'undefined') {
      console.warn('SharedArrayBuffer가 지원되지 않습니다. FFmpeg를 사용할 수 없습니다.');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// 통합 렌더링 함수 (FFmpeg 우선, 실패시 Canvas 폴백)
export async function renderVideo(
  options: RenderOptions,
  onProgress?: (p: RenderProgress) => void,
  abortSignal?: AbortSignal,
  preferFFmpeg: boolean = true
): Promise<Blob> {
  // FFmpeg 우선 시도
  if (preferFFmpeg) {
    const ffmpegSupported = await checkFFmpegSupport();
    
    if (ffmpegSupported) {
      try {
        return await renderVideoWithFFmpeg(options, onProgress, abortSignal);
      } catch (error) {
        console.warn('FFmpeg 렌더링 실패, Canvas 폴백:', error);
        onProgress?.({ stage: 'preparing', progress: 0, message: 'Canvas 렌더링으로 전환...' });
      }
    }
  }

  // Canvas + MediaRecorder 폴백
  return renderVideoWithSubtitles(options, onProgress, abortSignal);
}
