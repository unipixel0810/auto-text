// ─── 히트맵용 전체 페이지 목록 (클릭 데이터 없어도 항상 표시) ──
export const ALL_TRACKABLE_PAGES: { path: string; label: string }[] = [
  { path: '/', label: '편집기 (홈)' },
  { path: '/landing', label: '랜딩 페이지' },
  { path: '/landing/ai-analysis', label: '랜딩 — AI 분석' },
  { path: '/landing/algorithm-trend', label: '랜딩 — 알고리즘 트렌드' },
  { path: '/landing/dna-styling', label: '랜딩 — DNA 스타일링' },
  { path: '/login', label: '로그인' },
  { path: '/projects', label: '프로젝트 목록' },
];

// ─── Heatmap rendering constants ─────────────────────────────────────────
export const HEATMAP_RADIUS = 30;
export const HEATMAP_MAX_ALPHA = 0.7;
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 750;
