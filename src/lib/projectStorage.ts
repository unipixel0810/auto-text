/**
 * 프로젝트 저장소 서비스
 * localStorage를 사용하여 프로젝트 데이터를 영구 보존합니다.
 */

import type { TranscriptItem, SubtitleItem } from '@/types/subtitle';

/** 편집 UI 상태 — 관리자 모드 전환 후 복원용 */
export interface EditorUIState {
    leftPct: number;
    rightPct: number;
    timelinePct: number;
    viewerZoom: number;
    timelineZoom: number;
    playbackQuality: 'auto' | 'high' | 'medium' | 'low';
    canvasAspectRatio: '16:9' | '9:16' | '1:1' | '3:4';
    activeTab: 'media' | 'audio' | 'stickers' | 'effects' | 'transitions';
    currentTool: 'selection' | 'blade';
    currentTime: number;
    snapEnabled: boolean;
    rippleMode: boolean;
}

export interface SavedProject {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    thumbnail?: string;
    videoFileName?: string;
    videoDuration?: number;
    videoSize?: number;
    transcripts: TranscriptItem[];
    subtitles: SubtitleItem[];
    clips: unknown[];
    uiState?: EditorUIState;
}

const STORAGE_KEY = 'autotext_projects';
const CURRENT_PROJECT_KEY = 'autotext_current_project';

/** localStorage 최대 용량 안전 마진 (4MB — 대부분 브라우저 한도 5~10MB) */
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;

/**
 * 프로젝트 데이터를 경량화 — blob URL, 큰 문자열 등 제거
 * localStorage에 저장할 수 없는/불필요한 데이터를 정리
 */
function lightenProject(project: SavedProject): SavedProject {
    return {
        ...project,
        thumbnail: undefined, // 썸네일은 용량 큼 (base64 이미지)
        clips: (project.clips as any[]).map((clip: any) => {
            // blob:// URL은 세션이 끝나면 무효 → 저장할 필요 없음
            const url = typeof clip.url === 'string' && clip.url.startsWith('blob:') ? '' : clip.url;
            // 불필요한 큰 필드 제거
            const { audioBuffer, waveformData, _cachedFrames, ...rest } = clip;
            return { ...rest, url };
        }),
    };
}

/** 모든 프로젝트 목록 가져오기 */
export function getAllProjects(): SavedProject[] {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/** 특정 프로젝트 가져오기 */
export function getProject(id: string): SavedProject | null {
    const projects = getAllProjects();
    return projects.find(p => p.id === id) || null;
}

/** 프로젝트 저장 (새로 만들기 or 업데이트) */
export function saveProject(project: SavedProject): void {
    if (typeof window === 'undefined') return;
    const projects = getAllProjects();
    const existingIndex = projects.findIndex(p => p.id === project.id);

    // 경량화하여 저장 (blob URL, thumbnail 등 제거)
    const lightProject = lightenProject(project);
    lightProject.updatedAt = new Date().toISOString();

    if (existingIndex >= 0) {
        projects[existingIndex] = lightProject;
    } else {
        projects.unshift(lightProject);
    }

    // JSON 크기 체크 후 저장 시도
    let json = JSON.stringify(projects);

    // 4MB 초과 시 오래된 프로젝트부터 제거
    while (json.length > MAX_STORAGE_BYTES && projects.length > 1) {
        // 현재 프로젝트가 아닌 가장 오래된 프로젝트 제거
        const removeIdx = projects.findLastIndex(p => p.id !== lightProject.id);
        if (removeIdx < 0) break;
        projects.splice(removeIdx, 1);
        json = JSON.stringify(projects);
    }

    try {
        localStorage.setItem(STORAGE_KEY, json);
    } catch {
        // 그래도 실패 → 현재 프로젝트만 저장
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([lightProject]));
        } catch {
            // clips도 너무 크면 clips를 비우고 저장
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify([{
                    ...lightProject,
                    clips: [],
                    transcripts: lightProject.transcripts.slice(0, 50),
                    subtitles: lightProject.subtitles.slice(0, 50),
                }]));
            } catch {
                console.error('[ProjectStorage] 저장 불가 — localStorage 용량 부족');
            }
        }
    }
}

/** 프로젝트 삭제 */
export function deleteProject(id: string): void {
    if (typeof window === 'undefined') return;
    const projects = getAllProjects().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

/** 프로젝트 이름 변경 */
export function renameProject(id: string, newName: string): void {
    const projects = getAllProjects();
    const project = projects.find(p => p.id === id);
    if (project) {
        project.name = newName;
        project.updatedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }
}

/** 현재 작업 중인 프로젝트 ID 가져오기 */
export function getCurrentProjectId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(CURRENT_PROJECT_KEY);
}

/** 현재 작업 중인 프로젝트 ID 설정 */
export function setCurrentProjectId(id: string | null): void {
    if (typeof window === 'undefined') return;
    if (id) {
        localStorage.setItem(CURRENT_PROJECT_KEY, id);
    } else {
        localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
}

/** 새 프로젝트 ID 생성 */
export function generateProjectId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 사람이 읽기 쉬운 날짜 형식 */
export function formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 파일 크기를 읽기 쉬운 형식으로 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
