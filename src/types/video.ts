export interface VideoClip {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
  thumbnails?: string[]; // array of thumbnail data URLs for timeline filmstrip
  waveform?: number[]; // normalized audio waveform data (0-1)
  volume?: number; // audio volume 0-100
  mediaWidth?: number; // original media width (e.g. 1920)
  mediaHeight?: number; // original media height (e.g. 1080)
  startTime: number;
  duration: number;
  originalDuration?: number; // preserved original duration before speed changes
  trackIndex: number; // 0: Text/Subtitle, 1: Video, 2: Audio
  trimStart?: number;
  trimEnd?: number;
  scale?: number;
  positionX?: number;
  positionY?: number;
  rotation?: number;
  opacity?: number;
  blendMode?: boolean;
  autoColorCorrection?: boolean;
  animationEffect?: string;
  speed?: number; // playback speed 0.1x ~ 10x
  linked?: boolean; // audio+video linked
  // Subtitle/Text Styling
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  glowColor?: string;
  borderColor?: string;
  borderWidth?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  lineHeight?: number;     // 줄간격, 기본 1.3
  letterSpacing?: number;  // 자간(em), 기본 0
  disabled?: boolean;
  /** 자막 애니메이션 설정 (trackIndex 0,5~8 자막 클립에 사용) */
  subtitleAnimationPreset?: string;   // AnimationPreset: 'none' | 'fade-in' | ...
  subtitleOutPreset?: string;          // OUT 애니메이션 프리셋
  subtitleAnimationDuration?: number;  // 0.1 ~ 1.0s
}

export interface LibraryItem {
  id: string;
  name: string;
  url: string;
  type: 'video' | 'audio' | 'image';
  duration: number;
  file: File;
}

export interface TimelineState {
  clips: VideoClip[];
  playheadPosition: number;
  zoom: number;
  scrollPosition: number;
}

export interface HistoryEntry {
  clips: VideoClip[];
  selectedClipIds: string[];
}

export interface ClipboardData {
  clip: VideoClip;
}
