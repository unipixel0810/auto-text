import type { AnalyticsEvent, AnalyticsEventType } from './types';
import { getSessionId } from './session';

const BATCH_INTERVAL = 3000;
const BATCH_SIZE = 20;
const RAGE_CLICK_THRESHOLD = 3;
const RAGE_CLICK_WINDOW = 500;
const RAGE_CLICK_RADIUS = 30;
const SCROLL_MILESTONES = [25, 50, 75, 100];

let eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let pageEntryTime = 0;
let reachedScrollDepths = new Set<number>();
let clickHistory: { x: number; y: number; time: number }[] = [];
let isInitialized = false;

function buildEvent(
  type: AnalyticsEventType,
  extra: Partial<AnalyticsEvent> = {}
): AnalyticsEvent {
  return {
    event_type: type,
    page_url: window.location.pathname + window.location.search,
    page_title: document.title,
    session_id: getSessionId(),
    user_agent: navigator.userAgent,
    referrer: document.referrer || undefined,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

function enqueue(event: AnalyticsEvent) {
  eventQueue.push(event);
  if (eventQueue.length >= BATCH_SIZE) flush();
}

async function flush() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, BATCH_SIZE);
  try {
    const res = await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) {
      eventQueue.unshift(...batch);
    }
  } catch {
    eventQueue.unshift(...batch);
  }
}

function getElementInfo(el: HTMLElement) {
  const tag = el.tagName?.toLowerCase() || '';
  const cls = el.className && typeof el.className === 'string'
    ? el.className.split(' ').slice(0, 3).join(' ')
    : '';
  const id = el.id || undefined;
  const text = (el.textContent || '').trim().slice(0, 50) || undefined;
  return { element_tag: tag, element_class: cls, element_id: id, element_text: text };
}

function detectRageClick(x: number, y: number): boolean {
  const now = Date.now();
  clickHistory.push({ x, y, time: now });
  clickHistory = clickHistory.filter(c => now - c.time < RAGE_CLICK_WINDOW);

  const nearby = clickHistory.filter(
    c => Math.abs(c.x - x) < RAGE_CLICK_RADIUS && Math.abs(c.y - y) < RAGE_CLICK_RADIUS
  );
  return nearby.length >= RAGE_CLICK_THRESHOLD;
}

function isInteractiveElement(el: HTMLElement): boolean {
  const tag = el.tagName?.toLowerCase();
  if (['a', 'button', 'input', 'select', 'textarea', 'video', 'audio'].includes(tag)) return true;
  if (el.getAttribute('role') === 'button') return true;
  if (el.onclick || el.getAttribute('onclick')) return true;
  const style = window.getComputedStyle(el);
  if (style.cursor === 'pointer') return true;
  return false;
}

function findInteractiveParent(el: HTMLElement, depth = 5): HTMLElement | null {
  let current: HTMLElement | null = el;
  for (let i = 0; i < depth && current; i++) {
    if (isInteractiveElement(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target) return;

  const x = Math.round(e.clientX);
  const y = Math.round(e.clientY);
  const info = getElementInfo(target);

  enqueue(buildEvent('click', { x_pos: x, y_pos: y, ...info }));

  const isCta = target.closest('[data-track="cta"]');
  if (isCta) {
    const ctaInfo = getElementInfo(isCta as HTMLElement);
    enqueue(buildEvent('cta_click', { x_pos: x, y_pos: y, ...ctaInfo }));
  }

  if (detectRageClick(x, y)) {
    enqueue(buildEvent('rage_click', { x_pos: x, y_pos: y, ...info }));
  }

  const interactive = findInteractiveParent(target);
  if (!interactive) {
    enqueue(buildEvent('dead_click', { x_pos: x, y_pos: y, ...info }));
  }
}

function handleScroll() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    1
  );
  const percent = Math.round((scrollTop / docHeight) * 100);

  for (const milestone of SCROLL_MILESTONES) {
    if (percent >= milestone && !reachedScrollDepths.has(milestone)) {
      reachedScrollDepths.add(milestone);
      enqueue(buildEvent('scroll', { scroll_depth: milestone }));
    }
  }
}

function handlePageLeave() {
  const timeOnPage = Math.round((Date.now() - pageEntryTime) / 1000);
  const event = buildEvent('page_leave', { time_on_page: timeOnPage });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      '/api/analytics/track',
      JSON.stringify({ events: [...eventQueue, event] })
    );
    eventQueue = [];
  } else {
    enqueue(event);
    flush();
  }
}

let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
function throttledScroll() {
  if (scrollTimeout) return;
  scrollTimeout = setTimeout(() => {
    handleScroll();
    scrollTimeout = null;
  }, 200);
}

export function initTracker() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  pageEntryTime = Date.now();
  reachedScrollDepths = new Set();
  clickHistory = [];

  enqueue(buildEvent('page_view'));

  document.addEventListener('click', handleClick, { passive: true });
  window.addEventListener('scroll', throttledScroll, { passive: true });
  window.addEventListener('beforeunload', handlePageLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handlePageLeave();
  });

  flushTimer = setInterval(flush, BATCH_INTERVAL);
}

export function destroyTracker() {
  if (!isInitialized) return;
  isInitialized = false;

  document.removeEventListener('click', handleClick);
  window.removeEventListener('scroll', throttledScroll);
  window.removeEventListener('beforeunload', handlePageLeave);

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  flush();
}

export function resetPageTracking() {
  pageEntryTime = Date.now();
  reachedScrollDepths = new Set();
  clickHistory = [];
  enqueue(buildEvent('page_view'));
}
