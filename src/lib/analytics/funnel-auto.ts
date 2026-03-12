import { trackCustomFunnelStep } from './funnel';

interface FunnelStep {
  name: string;
  label: string;
  order: number;
  trigger?: 'page_view' | 'click' | 'custom';
  url_pattern?: string;
  css_selector?: string;
}

interface FunnelDef {
  id: string;
  steps: FunnelStep[];
  is_active: boolean;
}

let loadedFunnels: FunnelDef[] = [];
let clickListener: ((e: Event) => void) | null = null;

/** 서버에서 활성 퍼널 정의를 로드 */
export async function loadActiveFunnels(): Promise<void> {
  try {
    const res = await fetch('/api/funnels');
    const data = await res.json();
    loadedFunnels = (data.funnels || []).filter((f: FunnelDef) => f.is_active);
  } catch {
    loadedFunnels = [];
  }
}

/** 현재 pathname에 매칭되는 page_view 트리거 자동 실행 */
export function checkPageViewTriggers(pathname: string): void {
  for (const funnel of loadedFunnels) {
    for (const step of funnel.steps) {
      if (step.trigger !== 'page_view' || !step.url_pattern) continue;

      const pattern = step.url_pattern;
      // 정확 매칭 또는 와일드카드(*)로 시작 매칭
      const matched = pattern.endsWith('*')
        ? pathname.startsWith(pattern.slice(0, -1))
        : pathname === pattern;

      if (matched) {
        trackCustomFunnelStep(step.name);
      }
    }
  }
}

/** click 트리거를 위한 전역 클릭 리스너 설정 */
export function setupClickTriggers(): void {
  cleanupClickTriggers();

  clickListener = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    for (const funnel of loadedFunnels) {
      for (const step of funnel.steps) {
        if (step.trigger !== 'click' || !step.css_selector) continue;

        // target 또는 부모가 CSS 선택자에 매칭되는지 확인
        if (target.closest(step.css_selector)) {
          trackCustomFunnelStep(step.name);
        }
      }
    }
  };

  document.addEventListener('click', clickListener, true);
}

/** 클릭 리스너 정리 */
export function cleanupClickTriggers(): void {
  if (clickListener) {
    document.removeEventListener('click', clickListener, true);
    clickListener = null;
  }
}
