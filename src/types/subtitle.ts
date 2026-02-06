/**
 * 자막 시스템 타입 정의
 * Next.js 프로젝트용 자막 분석 및 추천 시스템
 */

// ============================================
// 자막 타입 정의
// ============================================

export type SubtitleType = 'ENTERTAINMENT' | 'SITUATION' | 'EXPLANATION' | 'TRANSCRIPT';

export const SUBTITLE_TYPES = {
  ENTERTAINMENT: 'ENTERTAINMENT',
  SITUATION: 'SITUATION',
  EXPLANATION: 'EXPLANATION',
  TRANSCRIPT: 'TRANSCRIPT',
} as const;

export const SUBTITLE_TYPE_LABELS: Record<SubtitleType, string> = {
  ENTERTAINMENT: '예능',
  SITUATION: '상황',
  EXPLANATION: '설명',
  TRANSCRIPT: '말자막',
};

export const SUBTITLE_TYPE_DESCRIPTIONS: Record<SubtitleType, string> = {
  ENTERTAINMENT: '시청자의 웃음이나 흥미를 유발하는 콘텐츠',
  SITUATION: '현재 상황이나 맥락을 설명하는 콘텐츠',
  EXPLANATION: '정보나 지식을 전달하는 교육적 콘텐츠',
  TRANSCRIPT: '음성을 그대로 텍스트로 표시하는 대본형 자막',
};

// ============================================
// 자막 스타일 정의
// ============================================

export interface SubtitleStyle {
  /** X 위치 (0-100, 퍼센트) */
  x: number;
  /** Y 위치 (0-100, 퍼센트) */
  y: number;
  /** 폰트 패밀리 */
  fontFamily: string;
  /** 폰트 크기 (px) */
  fontSize: number;
  /** 폰트 굵기 */
  fontWeight: number;
  /** 텍스트 색상 */
  color: string;
  /** 배경 색상 (투명 가능) */
  backgroundColor: string;
  /** 테두리(Stroke) 색상 */
  strokeColor: string;
  /** 테두리 두께 */
  strokeWidth: number;
  /** 그림자 색상 */
  shadowColor: string;
  /** 그림자 X 오프셋 */
  shadowOffsetX: number;
  /** 그림자 Y 오프셋 */
  shadowOffsetY: number;
  /** 그림자 블러 */
  shadowBlur: number;
  /** 텍스트 정렬 */
  textAlign: 'left' | 'center' | 'right';
  /** 최대 너비 (0-100, 퍼센트) - 줄바꿈 조절용 */
  maxWidth?: number;
}

/** 기본 자막 스타일 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  x: 50,
  y: 85,
  fontFamily: 'Pretendard, sans-serif',
  fontSize: 48,
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

/** 타입별 기본 스타일 프리셋 */
export const TYPE_STYLE_PRESETS: Record<SubtitleType, Partial<SubtitleStyle>> = {
  ENTERTAINMENT: {
    color: '#FFE066',
    fontSize: 56,
    fontWeight: 800,
    strokeColor: '#FF6B6B',
    strokeWidth: 3,
  },
  SITUATION: {
    color: '#A8E6CF',
    fontSize: 40,
    fontWeight: 500,
    y: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  EXPLANATION: {
    color: '#88D8FF',
    fontSize: 44,
    fontWeight: 600,
    strokeColor: '#0066CC',
  },
  TRANSCRIPT: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: 500,
  },
};

// ============================================
// 자막 아이템 인터페이스
// ============================================

export interface SubtitleItem {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  type: SubtitleType;
  confidence: number;
  /** 개별 스타일 (없으면 기본 스타일 사용) */
  style?: Partial<SubtitleStyle>;
  metadata?: RecommendationMetadata;
}

// ============================================
// 원본 대본 (Transcript) 아이템
// ============================================

export interface TranscriptItem {
  id: string;
  startTime: number;
  endTime: number;
  /** 원본 STT 텍스트 */
  originalText: string;
  /** 사용자가 수정한 텍스트 */
  editedText: string;
  /** 수정 여부 */
  isEdited: boolean;
}

// ============================================
// 프로젝트 상태
// ============================================

export interface ProjectState {
  /** 프로젝트 ID */
  id: string;
  /** 비디오 파일 정보 */
  videoFile: {
    name: string;
    size: number;
    duration: number;
  } | null;
  /** 비디오 URL */
  videoUrl: string | null;
  /** 원본 대본 목록 */
  transcripts: TranscriptItem[];
  /** AI 생성 자막 목록 */
  subtitles: SubtitleItem[];
  /** 글로벌 스타일 설정 */
  globalStyle: SubtitleStyle;
  /** 현재 선택된 자막 ID */
  selectedSubtitleId: string | null;
  /** 현재 재생 시간 */
  currentTime: number;
}

// ============================================
// 메타데이터 구조
// ============================================

interface BaseRecommendationReason {
  summary: string;
  detail: string;
  keywords: string[];
  score: number;
}

export interface EntertainmentMetadata extends BaseRecommendationReason {
  type: 'ENTERTAINMENT';
  humorType?: string;
  emotionalIntensity?: number;
  expectedReaction?: string;
}

export interface SituationMetadata extends BaseRecommendationReason {
  type: 'SITUATION';
  situationCategory?: string;
  contextImportance?: number;
  relatedSceneIds?: string[];
}

export interface ExplanationMetadata extends BaseRecommendationReason {
  type: 'EXPLANATION';
  topicField?: string;
  difficultyLevel?: number;
  references?: string[];
  keyConcepts?: string[];
}

export interface TranscriptMetadata extends BaseRecommendationReason {
  type: 'TRANSCRIPT';
  speaker?: string;
  speechRate?: number;
  emotionTone?: string;
}

export type RecommendationMetadata =
  | EntertainmentMetadata
  | SituationMetadata
  | ExplanationMetadata
  | TranscriptMetadata;

// ============================================
// 유틸리티 타입
// ============================================

export type SubtitleItemCreate = Omit<SubtitleItem, 'id' | 'confidence' | 'metadata'> & {
  id?: string;
  confidence?: number;
  metadata?: RecommendationMetadata;
};

export type SubtitleItemUpdate = Partial<Omit<SubtitleItem, 'id'>> & {
  id: string;
};

export function isValidSubtitleType(value: unknown): value is SubtitleType {
  return (
    typeof value === 'string' &&
    ['ENTERTAINMENT', 'SITUATION', 'EXPLANATION', 'TRANSCRIPT'].includes(value)
  );
}
