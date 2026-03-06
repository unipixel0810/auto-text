/**
 * A/B 실험 설정 관리
 * 저장된 실험 설정을 로드하고 적용하는 로직
 */

export interface ExperimentConfig {
  name: string;
  pageUrl: string;
  elementSelector: string;
  variantA: string;
  variantB: string;
  elementType: 'button' | 'heading' | 'text' | 'link';
}

let experimentConfigs: ExperimentConfig[] = [];

/**
 * 실험 설정 로드 (API에서)
 */
export async function loadExperimentConfigs(): Promise<ExperimentConfig[]> {
  try {
    // API에서 실험 목록 가져오기
    const res = await fetch('/api/ab-experiments/list');
    const data = await res.json();
    
    if (data.experiments) {
      experimentConfigs = data.experiments.map((exp: any) => ({
        name: exp.name,
        pageUrl: exp.pageUrl,
        elementSelector: exp.elementSelector,
        variantA: exp.variantA,
        variantB: exp.variantB,
        elementType: exp.elementType,
      }));
    }
    
    // localStorage에도 저장 (오프라인 지원)
    if (typeof window !== 'undefined') {
      localStorage.setItem('ab-experiments', JSON.stringify(experimentConfigs));
    }
    
    return experimentConfigs;
  } catch (err) {
    console.error('Failed to load experiment configs:', err);
    
    // 오프라인일 경우 localStorage에서 로드
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ab-experiments');
      if (stored) {
        try {
          experimentConfigs = JSON.parse(stored);
          return experimentConfigs;
        } catch (e) {
          console.error('Failed to parse stored experiments:', e);
        }
      }
    }
    
    return [];
  }
}

/**
 * 현재 페이지에 적용할 실험 찾기
 */
export function getExperimentsForCurrentPage(): ExperimentConfig[] {
  if (typeof window === 'undefined') return [];
  
  const currentPath = window.location.pathname;
  return experimentConfigs.filter(exp => {
    // 정확히 일치하거나 와일드카드 매칭
    return exp.pageUrl === currentPath || 
           exp.pageUrl === '*' ||
           (exp.pageUrl.endsWith('*') && currentPath.startsWith(exp.pageUrl.slice(0, -1)));
  });
}

/**
 * 실험 설정을 페이지에 적용
 */
export function applyExperimentsToPage() {
  if (typeof window === 'undefined') return;
  
  const experiments = getExperimentsForCurrentPage();
  
  experiments.forEach(exp => {
    const elements = document.querySelectorAll(exp.elementSelector);
    
    elements.forEach(el => {
      // data-ab-test 속성 추가
      el.setAttribute('data-ab-test', exp.name);
      el.setAttribute('data-ab-variant-b', exp.variantB);
    });
  });
}

/**
 * 실험 설정 저장
 */
export async function saveExperimentConfig(config: ExperimentConfig): Promise<boolean> {
  try {
    // API에 저장
    const res = await fetch('/api/ab-experiments/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    
    if (!res.ok) {
      throw new Error('Failed to save experiment');
    }
    
    // 로컬에도 저장
    experimentConfigs.push(config);
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ab-experiments');
      const existing = stored ? JSON.parse(stored) : [];
      existing.push(config);
      localStorage.setItem('ab-experiments', JSON.stringify(existing));
    }
    
    // 현재 페이지에 즉시 적용
    applyExperimentsToPage();
    
    return true;
  } catch (err) {
    console.error('Failed to save experiment config:', err);
    return false;
  }
}
