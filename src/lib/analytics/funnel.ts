import { getSessionId } from './session';

/** 퍼널 단계 정의 */
export const FUNNEL_STEPS = [
  { name: 'landing_visit', label: '랜딩페이지 방문', order: 1 },
  { name: 'cta_click', label: 'CTA 버튼 클릭', order: 2 },
  { name: 'signup_form_open', label: '가입 폼 열림', order: 3 },
  { name: 'email_input', label: '이메일 입력', order: 4 },
  { name: 'signup_complete', label: '가입 완료', order: 5 },
] as const;

export type FunnelStepName = (typeof FUNNEL_STEPS)[number]['name'];

/** 세션 내 중복 방지용 Set */
const trackedSteps = new Set<string>();

/** 퍼널 이벤트 전송 (세션당 단계별 1회) */
export function trackFunnelStep(stepName: FunnelStepName): void {
  if (typeof window === 'undefined') return;

  const sessionId = getSessionId();
  const key = `${sessionId}:${stepName}`;

  if (trackedSteps.has(key)) return;
  trackedSteps.add(key);

  try {
    navigator.sendBeacon?.(
      '/api/funnel',
      JSON.stringify({ step_name: stepName, session_id: sessionId })
    ) || fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_name: stepName, session_id: sessionId }),
      keepalive: true,
    });
  } catch {
    // 전송 실패 무시
  }
}
