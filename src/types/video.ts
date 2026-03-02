export interface VideoClip {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
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
}

export interface TimelineState {
  clips: VideoClip[];
  playheadPosition: number;
  zoom: number;
  scrollPosition: number;
}

export interface HistoryEntry {
  clips: VideoClip[];
  selectedClipId: string | null;
}

export interface ClipboardData {
  clip: VideoClip;
}
