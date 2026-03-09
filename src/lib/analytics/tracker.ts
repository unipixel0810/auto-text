import type { AnalyticsEvent, AnalyticsEventType, DemographicData, PageView } from './types';
import { getSessionId } from './session';
import { UAParser } from 'ua-parser-js';

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
let demographicData: Partial<DemographicData> | null = null;
let previousErrorHandler: OnErrorEventHandler = null;
let previousUnhandledRejectionHandler: ((ev: PromiseRejectionEvent) => void) | null = null;

function getUtmParams() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  };
}

function getDeviceInfo() {
  const parser = new UAParser();
  const result = parser.getResult();
  const deviceType = result.device.type === 'mobile' ? 'mobile' :
                     result.device.type === 'tablet' ? 'tablet' : 'desktop';

  return {
    device_type: deviceType as 'mobile' | 'tablet' | 'desktop',
    browser: result.browser.name || 'Unknown',
    os: result.os.name || 'Unknown',
    screen_width: window.innerWidth,
  };
}

function buildEvent(
  type: AnalyticsEventType,
  extra: Partial<AnalyticsEvent> = {}
): AnalyticsEvent {
  const utm = type === 'page_view' ? getUtmParams() : {};
  const device = type === 'page_view' ? getDeviceInfo() : {};

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
    ...utm,
    ...device,
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

// --- New: Demographic data collection ---

function collectDemographics(): Partial<DemographicData> {
  try {
    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    return {
      language: navigator.language || 'unknown',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
      country: 'unknown',
      region: 'unknown',
      city: 'unknown',
      connectionType: connection?.effectiveType || connection?.type || 'unknown',
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth || 0,
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack === '1' || (nav as any).globalPrivacyControl === true,
      estimatedAgeGroup: 'unknown',
      estimatedGender: 'unknown',
    };
  } catch (e) {
    console.warn('[Analytics] Failed to collect demographics:', e);
    return {
      language: 'unknown',
      timezone: 'unknown',
      country: 'unknown',
      region: 'unknown',
      city: 'unknown',
      connectionType: 'unknown',
      screenResolution: 'unknown',
      colorDepth: 0,
      touchSupport: false,
      cookiesEnabled: false,
      doNotTrack: false,
      estimatedAgeGroup: 'unknown',
      estimatedGender: 'unknown',
    };
  }
}

// --- New: Error tracking ---

function initErrorTracking() {
  try {
    previousErrorHandler = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      try {
        enqueue(buildEvent('error', {
          element_text: String(message).slice(0, 200),
          element_tag: 'js_error',
          element_id: source ? String(source).slice(0, 200) : undefined,
          x_pos: lineno || undefined,
          y_pos: colno || undefined,
          element_class: error?.stack?.slice(0, 500) || undefined,
        } as any));
      } catch {
        // Silently fail to avoid infinite error loops
      }

      // Call previous handler if it exists
      if (typeof previousErrorHandler === 'function') {
        return previousErrorHandler(message, source, lineno, colno, error);
      }
      return false;
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        const message = reason instanceof Error
          ? reason.message
          : String(reason);
        const stack = reason instanceof Error
          ? reason.stack?.slice(0, 500)
          : undefined;

        enqueue(buildEvent('error', {
          element_text: message.slice(0, 200),
          element_tag: 'unhandled_rejection',
          element_class: stack || undefined,
        } as any));
      } catch {
        // Silently fail
      }
    };

    previousUnhandledRejectionHandler = handleUnhandledRejection;
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
  } catch (e) {
    console.warn('[Analytics] Failed to initialize error tracking:', e);
  }
}

function destroyErrorTracking() {
  try {
    window.onerror = previousErrorHandler;
    previousErrorHandler = null;

    if (previousUnhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', previousUnhandledRejectionHandler);
      previousUnhandledRejectionHandler = null;
    }
  } catch {
    // Silently fail
  }
}

// --- New: Performance / Web Vitals tracking ---

function initPerformanceTracking() {
  try {
    if (typeof PerformanceObserver === 'undefined') return;

    const vitals: Record<string, number> = {};

    // LCP - Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          vitals.lcp = Math.round(lastEntry.startTime);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // LCP not supported
    }

    // FCP - First Contentful Paint
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
        if (fcpEntry) {
          vitals.fcp = Math.round(fcpEntry.startTime);
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch {
      // FCP not supported
    }

    // CLS - Cumulative Layout Shift
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value || 0;
          }
        }
        vitals.cls = Math.round(clsValue * 1000) / 1000;
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // CLS not supported
    }

    // TTFB - Time to First Byte
    try {
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries.length > 0) {
        const navEntry = navEntries[0] as PerformanceNavigationTiming;
        vitals.ttfb = Math.round(navEntry.responseStart - navEntry.requestStart);
      }
    } catch {
      // TTFB not supported
    }

    // Send performance event after a delay to collect all metrics
    setTimeout(() => {
      try {
        if (Object.keys(vitals).length > 0) {
          const parser = new UAParser();
          const result = parser.getResult();
          const deviceType = result.device.type === 'mobile' ? 'mobile' :
                             result.device.type === 'tablet' ? 'tablet' : 'desktop';
          const nav = navigator as any;
          const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

          enqueue(buildEvent('performance', {
            element_text: JSON.stringify(vitals).slice(0, 500),
            element_tag: deviceType,
            element_class: connection?.effectiveType || 'unknown',
          } as any));
        }
      } catch {
        // Silently fail
      }
    }, 5000);
  } catch (e) {
    console.warn('[Analytics] Failed to initialize performance tracking:', e);
  }
}

// --- New: Form interaction tracking ---

function handleFormFocus(e: FocusEvent) {
  try {
    const target = e.target as HTMLElement;
    if (!target) return;
    const tag = target.tagName?.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return;

    const info = getElementInfo(target);
    enqueue(buildEvent('form_interaction', {
      ...info,
      element_text: `focus:${info.element_tag}`,
    } as any));
  } catch {
    // Silently fail
  }
}

function handleFormBlur(e: FocusEvent) {
  try {
    const target = e.target as HTMLElement;
    if (!target) return;
    const tag = target.tagName?.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return;

    const info = getElementInfo(target);
    enqueue(buildEvent('form_interaction', {
      ...info,
      element_text: `blur:${info.element_tag}`,
    } as any));
  } catch {
    // Silently fail
  }
}

function handleFormSubmit(e: Event) {
  try {
    const target = e.target as HTMLFormElement;
    if (!target || target.tagName?.toLowerCase() !== 'form') return;

    const info = getElementInfo(target);
    enqueue(buildEvent('form_interaction', {
      ...info,
      element_text: `submit:${info.element_id || info.element_class || 'form'}`,
    } as any));
  } catch {
    // Silently fail
  }
}

// --- New: Visibility change tracking ---

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    handlePageLeave();
  }
}

// --- Main init / destroy ---

export function initTracker() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  pageEntryTime = Date.now();
  reachedScrollDepths = new Set();
  clickHistory = [];

  // Collect demographics and include with first page_view
  demographicData = collectDemographics();
  const pageViewEvent = buildEvent('page_view');
  if (demographicData) {
    (pageViewEvent as any).demographics = demographicData;
  }
  enqueue(pageViewEvent);

  // Core tracking
  document.addEventListener('click', handleClick, { passive: true });
  window.addEventListener('scroll', throttledScroll, { passive: true });
  window.addEventListener('beforeunload', handlePageLeave);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Error tracking
  initErrorTracking();

  // Performance / Web Vitals tracking
  initPerformanceTracking();

  // Form interaction tracking
  document.addEventListener('focusin', handleFormFocus, { passive: true });
  document.addEventListener('focusout', handleFormBlur, { passive: true });
  document.addEventListener('submit', handleFormSubmit, { passive: true });

  flushTimer = setInterval(flush, BATCH_INTERVAL);
}

export function destroyTracker() {
  if (!isInitialized) return;
  isInitialized = false;

  document.removeEventListener('click', handleClick);
  window.removeEventListener('scroll', throttledScroll);
  window.removeEventListener('beforeunload', handlePageLeave);
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  // Cleanup error tracking
  destroyErrorTracking();

  // Cleanup form interaction tracking
  document.removeEventListener('focusin', handleFormFocus);
  document.removeEventListener('focusout', handleFormBlur);
  document.removeEventListener('submit', handleFormSubmit);

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
