/**
 * 자막 시스템 타입 정의
 * Next.js 프로젝트용 자막 분석 및 추천 시스템
 */

// ============================================
// 자막 타입 정의
// ============================================

export type SubtitleType = 'ENTERTAINMENT' | 'SITUATION' | 'EXPLANATION' | 'CONTEXT' | 'TRANSCRIPT';

export const SUBTITLE_TYPES = {
  ENTERTAINMENT: 'ENTERTAINMENT',
  SITUATION: 'SITUATION',
  EXPLANATION: 'EXPLANATION',
  CONTEXT: 'CONTEXT',
  TRANSCRIPT: 'TRANSCRIPT',
} as const;

export const SUBTITLE_TYPE_LABELS: Record<SubtitleType, string> = {
  ENTERTAINMENT: '예능',
  SITUATION: '상황',
  EXPLANATION: '설명',
  CONTEXT: '맥락',
  TRANSCRIPT: '말자막',
};

export const SUBTITLE_TYPE_DESCRIPTIONS: Record<SubtitleType, string> = {
  ENTERTAINMENT: '시청자의 웃음이나 흥미를 유발하는 콘텐츠',
  SITUATION: '현재 상황이나 맥락을 설명하는 콘텐츠',
  EXPLANATION: '정보나 지식을 전달하는 교육적 콘텐츠',
  CONTEXT: '앞뒤 상황을 이어주는 배경 지식 및 맥락 정보',
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
  fontFamily: 'PaperlogyExtraBold, sans-serif',
  fontSize: 35,
  fontWeight: 800,
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
    fontSize: 42,
    fontWeight: 800,
    strokeColor: '#FF6B6B',
    strokeWidth: 3,
  },
  SITUATION: {
    color: '#A8E6CF',
    fontSize: 32,
    fontWeight: 500,
    y: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  EXPLANATION: {
    color: '#88D8FF',
    fontSize: 36,
    fontWeight: 600,
    strokeColor: '#0066CC',
  },
  CONTEXT: {
    color: '#C9A0FF',
    fontSize: 34,
    fontWeight: 600,
    strokeColor: '#6B21A8',
    backgroundColor: 'rgba(107,33,168,0.3)',
  },
  TRANSCRIPT: {
    color: '#FFFFFF',
    fontSize: 35,
    fontWeight: 500,
  },
};

// ============================================
// 자막 아이템 인터페이스
// ============================================

// ============================================
// 자막 애니메이션 타입
// ============================================

export type AnimationPreset =
  | 'none'
  | 'fade-in' | 'fade-out'
  | 'slide-up' | 'slide-down'
  | 'pop' | 'typewriter'
  | 'bounce' | 'shake';

export interface SubtitleAnimation {
  /** 등장 애니메이션 */
  inPreset: AnimationPreset;
  /** 퇴장 애니메이션 */
  outPreset: AnimationPreset;
  /** 애니메이션 지속 시간 (초, 0.1 ~ 1.0) */
  duration: number;
}

export const DEFAULT_SUBTITLE_ANIMATION: SubtitleAnimation = {
  inPreset: 'none',
  outPreset: 'none',
  duration: 0.3,
};

/** 무료 사용자에게 허용된 프리셋 */
export const FREE_ANIMATION_PRESETS: AnimationPreset[] = ['none', 'fade-in', 'fade-out', 'slide-up'];

/** 프리셋 메타데이터 */
export const ANIMATION_PRESET_META: Record<AnimationPreset, { label: string; icon: string; isPro: boolean }> = {
  'none':       { label: '없음',       icon: '⊘',  isPro: false },
  'fade-in':    { label: '페이드 인',   icon: '🌅', isPro: false },
  'fade-out':   { label: '페이드 아웃', icon: '🌇', isPro: false },
  'slide-up':   { label: '슬라이드 업', icon: '⬆️', isPro: false },
  'slide-down': { label: '슬라이드 다운', icon: '⬇️', isPro: true },
  'pop':        { label: '팝',         icon: '💥', isPro: true },
  'typewriter': { label: '타이핑',     icon: '⌨️', isPro: true },
  'bounce':     { label: '바운스',     icon: '🏀', isPro: true },
  'shake':      { label: '쉐이크',     icon: '〰️', isPro: true },
};

export interface SubtitleItem {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  type: SubtitleType;
  confidence: number;
  /** 개별 스타일 (없으면 기본 스타일 사용) */
  style?: Partial<SubtitleStyle>;
  /** 애니메이션 설정 */
  animation?: SubtitleAnimation;
  metadata?: RecommendationMetadata;
}

// ============================================
// 원본 대본 (Transcript) 아이템
// ============================================

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
}

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
  /** 자막 색상 */
  color?: string;
  /** 자막 테두리 색상 */
  strokeColor?: string;
  /** STT 단어별 타이밍 (음성 싱크용) */
  words?: WordTiming[];
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

export interface ContextMetadata extends BaseRecommendationReason {
  type: 'CONTEXT';
  backgroundInfo?: string;
  relatedTopics?: string[];
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
  | ContextMetadata
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
    Object.values(SUBTITLE_TYPES).includes(value as SubtitleType)
  );
}
