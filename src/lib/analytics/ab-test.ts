/**
 * A/B Test — Cookie-based variant distribution + DOM replacement + event tracking
 *
 * Usage: Place `data-ab-test="experiment-name"` on any element.
 *        Add `data-ab-variant-b="Alternative text"` for variant B content.
 *        Call `initABTests()` after DOM is ready.
 */

import { getSessionId } from './session';

// ── Constants ──────────────────────────────────────────────
const COOKIE_PREFIX = 'ab_variant_';
const COOKIE_DAYS = 30;
const TRACK_ENDPOINT = '/api/ab/track';

// ── Types ──────────────────────────────────────────────────
export type ABVariant = 'A' | 'B';
export type ABEventType = 'impression' | 'click' | 'conversion';

interface ABEvent {
  experiment_name: string;
  variant: ABVariant;
  event_type: ABEventType;
  session_id: string;
}

// ── Cookie Helpers ─────────────────────────────────────────
function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Variant Assignment ─────────────────────────────────────
/**
 * 방문자를 A 또는 B에 배정. 같은 방문자는 cookie를 통해 항상 같은 variant를 봄.
 * @param experimentName 실험 이름
 * @param ratio B variant 비율 (0~1, 기본 0.5 = 50:50)
 */
export function getVariant(experimentName: string, ratio = 0.5): ABVariant {
  const cookieName = COOKIE_PREFIX + experimentName;
  const existing = getCookie(cookieName);
  if (existing === 'A' || existing === 'B') return existing;

  const variant: ABVariant = Math.random() < ratio ? 'B' : 'A';
  setCookie(cookieName, variant, COOKIE_DAYS);
  return variant;
}

// ── Event Tracking ─────────────────────────────────────────
const sentImpressions = new Set<string>();

function trackABEvent(event: ABEvent): void {
  // impression 중복 방지 (같은 세션에서 같은 실험)
  if (event.event_type === 'impression') {
    const key = `${event.experiment_name}:${event.session_id}`;
    if (sentImpressions.has(key)) return;
    sentImpressions.add(key);
  }

  // 비동기 전송 — 실패해도 사용자 경험에 영향 없음
  fetch(TRACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).catch(() => { /* silent */ });
}

export function trackImpression(experimentName: string, variant: ABVariant): void {
  trackABEvent({
    experiment_name: experimentName,
    variant,
    event_type: 'impression',
    session_id: getSessionId(),
  });
}

export function trackClick(experimentName: string, variant: ABVariant): void {
  trackABEvent({
    experiment_name: experimentName,
    variant,
    event_type: 'click',
    session_id: getSessionId(),
  });
}

export function trackConversion(experimentName: string, variant: ABVariant): void {
  trackABEvent({
    experiment_name: experimentName,
    variant,
    event_type: 'conversion',
    session_id: getSessionId(),
  });
}

// ── DOM Initialization ─────────────────────────────────────
/**
 * 페이지의 모든 [data-ab-test] 요소를 탐색하여:
 * 1. variant 배정
 * 2. B variant면 텍스트 교체
 * 3. impression 이벤트 전송
 * 4. 클릭 이벤트 리스너 등록
 */
export function initABTests(): void {
  if (typeof document === 'undefined') return;

  const elements = document.querySelectorAll<HTMLElement>('[data-ab-test]');
  elements.forEach((el) => {
    const experimentName = el.getAttribute('data-ab-test');
    if (!experimentName) return;

    const variant = getVariant(experimentName);

    // B variant: 텍스트 교체
    if (variant === 'B') {
      const variantBText = el.getAttribute('data-ab-variant-b');
      if (variantBText) {
        el.textContent = variantBText;
      }
    }

    // 이미 초기화된 요소는 건너뛰기
    if (el.getAttribute('data-ab-initialized') === 'true') return;
    el.setAttribute('data-ab-initialized', 'true');
    el.setAttribute('data-ab-assigned', variant);

    // impression 기록
    trackImpression(experimentName, variant);

    // click 이벤트 리스너
    el.addEventListener('click', () => {
      trackClick(experimentName, variant);
    });
  });
}
