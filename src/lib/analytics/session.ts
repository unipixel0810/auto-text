import type { AnalyticsSession } from './types';

const SESSION_KEY = 'analytics_session';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getSession(): AnalyticsSession {
  if (typeof window === 'undefined') {
    return { session_id: 'ssr', started_at: Date.now(), expires_at: Date.now() + SESSION_DURATION };
  }

  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const session: AnalyticsSession = JSON.parse(raw);
      if (Date.now() < session.expires_at) {
        // Extend session on activity
        session.expires_at = Date.now() + SESSION_DURATION;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
      }
    }
  } catch { /* ignore parse errors */ }

  const session: AnalyticsSession = {
    session_id: generateId(),
    started_at: Date.now(),
    expires_at: Date.now() + SESSION_DURATION,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSessionId(): string {
  return getSession().session_id;
}

// ─── Persistent Visitor ID (survives session expiry) ─────────────────────
const VISITOR_KEY = 'analytics_visitor_id';

export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';

  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
  } catch { /* ignore */ }

  const visitorId = generateId();
  try {
    localStorage.setItem(VISITOR_KEY, visitorId);
  } catch { /* ignore */ }
  return visitorId;
}
