/**
 * SRT 파일 생성 및 내보내기 유틸리티
 */

import type { SubtitleItem, SubtitleType } from '@/types/subtitle';

// ============================================
// 타입 정의
// ============================================

/**
 * SRT 내보내기 옵션
 */
export interface SrtExportOptions {
  /** 유형 태그 포함 여부 (기본값: true) */
  includeTypeTag?: boolean;
  /** 태그 형식 (기본값: 'bracket') */
  tagFormat?: 'bracket' | 'parenthesis' | 'emoji' | 'none';
  /** 커스텀 태그 라벨 */
  customLabels?: Partial<Record<SubtitleType, string>>;
  /** 파일명 (기본값: 'subtitle.srt') */
  filename?: string;
  /** UTF-8 BOM 포함 여부 (일부 플레이어 호환용, 기본값: true) */
  includeBOM?: boolean;
  /** 신뢰도 정보 포함 여부 */
  includeConfidence?: boolean;
}

/**
 * VTT 내보내기 옵션 (WebVTT 형식)
 */
export interface VttExportOptions extends SrtExportOptions {
  /** VTT 메타데이터 */
  metadata?: {
    title?: string;
    language?: string;
  };
}

// ============================================
// 상수 정의
// ============================================

/** 기본 태그 라벨 (한글) */
const DEFAULT_LABELS: Record<SubtitleType, string> = {
  ENTERTAINMENT: '예능',
  SITUATION: '상황',
  EXPLANATION: '설명',
  CONTEXT: '맥락',
  TRANSCRIPT: '말',
};

/** 이모지 태그 */
const EMOJI_LABELS: Record<SubtitleType, string> = {
  ENTERTAINMENT: '🎭',
  SITUATION: '📍',
  EXPLANATION: '📚',
  CONTEXT: '🔗',
  TRANSCRIPT: '💬',
};

/** UTF-8 BOM */
const UTF8_BOM = '\uFEFF';

// ============================================
// 시간 포맷팅 함수
// ============================================

/**
 * 초를 SRT 타임코드로 변환 (00:00:00,000)
 */
export function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
  ].join(':') + ',' + millis.toString().padStart(3, '0');
}

/**
 * 초를 VTT 타임코드로 변환 (00:00:00.000)
 */
export function formatVttTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
  ].join(':') + '.' + millis.toString().padStart(3, '0');
}

// ============================================
// 태그 생성 함수
// ============================================

/**
 * 자막 유형에 따른 태그 문자열 생성
 */
function createTypeTag(
  type: SubtitleType,
  options: SrtExportOptions
): string {
  if (options.tagFormat === 'none' || !options.includeTypeTag) {
    return '';
  }

  const labels = { ...DEFAULT_LABELS, ...options.customLabels };
  const label = labels[type];

  switch (options.tagFormat) {
    case 'bracket':
      return `[${label}] `;
    case 'parenthesis':
      return `(${label}) `;
    case 'emoji':
      return `${EMOJI_LABELS[type]} `;
    default:
      return `[${label}] `;
  }
}

// ============================================
// SRT 생성 함수
// ============================================

/**
 * SubtitleItem 배열을 SRT 문자열로 변환
 */
export function generateSrtContent(
  subtitles: SubtitleItem[],
  options: SrtExportOptions = {}
): string {
  const opts: SrtExportOptions = {
    includeTypeTag: true,
    tagFormat: 'bracket',
    includeBOM: true,
    includeConfidence: false,
    ...options,
  };

  const lines: string[] = [];

  // BOM 추가 (옵션)
  if (opts.includeBOM) {
    lines.push(UTF8_BOM);
  }

  subtitles.forEach((subtitle, index) => {
    // 시퀀스 번호
    lines.push((index + 1).toString());

    // 타임코드
    const startTime = formatSrtTime(subtitle.startTime);
    const endTime = formatSrtTime(subtitle.endTime);
    lines.push(`${startTime} --> ${endTime}`);

    // 내용 (태그 + 텍스트)
    const tag = createTypeTag(subtitle.type, opts);
    let content = `${tag}${subtitle.text}`;

    // 신뢰도 정보 추가 (옵션)
    if (opts.includeConfidence && subtitle.confidence > 0) {
      content += ` (${Math.round(subtitle.confidence * 100)}%)`;
    }

    lines.push(content);

    // 빈 줄 (구분자)
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * SubtitleItem 배열을 VTT 문자열로 변환
 */
export function generateVttContent(
  subtitles: SubtitleItem[],
  options: VttExportOptions = {}
): string {
  const opts: VttExportOptions = {
    includeTypeTag: true,
    tagFormat: 'bracket',
    includeConfidence: false,
    ...options,
  };

  const lines: string[] = ['WEBVTT'];

  // 메타데이터 추가
  if (opts.metadata?.title) {
    lines.push(`Title: ${opts.metadata.title}`);
  }
  if (opts.metadata?.language) {
    lines.push(`Language: ${opts.metadata.language}`);
  }

  lines.push(''); // 헤더 후 빈 줄

  subtitles.forEach((subtitle, index) => {
    // 큐 ID (옵션)
    lines.push(subtitle.id || `cue-${index + 1}`);

    // 타임코드
    const startTime = formatVttTime(subtitle.startTime);
    const endTime = formatVttTime(subtitle.endTime);
    lines.push(`${startTime} --> ${endTime}`);

    // 내용
    const tag = createTypeTag(subtitle.type, opts);
    let content = `${tag}${subtitle.text}`;

    if (opts.includeConfidence && subtitle.confidence > 0) {
      content += ` (${Math.round(subtitle.confidence * 100)}%)`;
    }

    lines.push(content);
    lines.push('');
  });

  return lines.join('\n');
}

// ============================================
// 다운로드 함수
// ============================================

/**
 * 텍스트 내용을 파일로 다운로드
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // 정리
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * SRT 파일 다운로드
 */
export function downloadSrt(
  subtitles: SubtitleItem[],
  options: SrtExportOptions = {}
): void {
  const filename = options.filename || 'subtitle.srt';
  const content = generateSrtContent(subtitles, options);
  downloadTextFile(content, filename, 'text/srt');
}

/**
 * VTT 파일 다운로드
 */
export function downloadVtt(
  subtitles: SubtitleItem[],
  options: VttExportOptions = {}
): void {
  const filename = options.filename?.replace('.srt', '.vtt') || 'subtitle.vtt';
  const content = generateVttContent(subtitles, options);
  downloadTextFile(content, filename, 'text/vtt');
}

// ============================================
// JSON 내보내기 (백업/편집용)
// ============================================

/**
 * JSON 형식으로 내보내기
 */
export function downloadJson(
  subtitles: SubtitleItem[],
  filename: string = 'subtitle.json'
): void {
  const content = JSON.stringify(subtitles, null, 2);
  downloadTextFile(content, filename, 'application/json');
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * SRT 문자열 파싱 (가져오기용)
 */
export function parseSrtContent(srtContent: string): Partial<SubtitleItem>[] {
  const subtitles: Partial<SubtitleItem>[] = [];
  
  // BOM 제거
  const content = srtContent.replace(/^\uFEFF/, '');
  
  // 블록 분리
  const blocks = content.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n').filter(line => line.trim());
    
    if (lines.length < 3) continue;

    // 시퀀스 번호 (첫 번째 줄)
    const sequenceMatch = lines[0].match(/^\d+$/);
    if (!sequenceMatch) continue;

    // 타임코드 (두 번째 줄)
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;

    const startTime = parseSrtTime(timeMatch[1]);
    const endTime = parseSrtTime(timeMatch[2]);

    // 텍스트 (나머지 줄)
    const textLines = lines.slice(2);
    let text = textLines.join('\n');

    // 태그 추출
    let type: SubtitleType = 'SITUATION';
    const tagMatch = text.match(/^\[(예능|상황|설명)\]\s*/);
    if (tagMatch) {
      const tagMap: Record<string, SubtitleType> = {
        '예능': 'ENTERTAINMENT',
        '상황': 'SITUATION',
        '설명': 'EXPLANATION',
        '말': 'TRANSCRIPT',
      };
      type = tagMap[tagMatch[1]] || 'SITUATION';
      text = text.replace(tagMatch[0], '');
    }

    subtitles.push({
      id: `sub_${sequenceMatch[0]}`,
      startTime,
      endTime,
      text,
      type,
      confidence: 0,
    });
  }

  return subtitles;
}

/**
 * SRT 타임코드 파싱
 */
function parseSrtTime(timeString: string): number {
  const match = timeString.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * 미리보기용 SRT 문자열 생성 (처음 N개만)
 */
export function previewSrt(
  subtitles: SubtitleItem[],
  count: number = 5,
  options: SrtExportOptions = {}
): string {
  const preview = subtitles.slice(0, count);
  return generateSrtContent(preview, { ...options, includeBOM: false });
}
