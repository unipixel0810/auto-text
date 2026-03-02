import type { AnalyticsEvent } from './types';
import { getSupabase } from './supabase';

const memoryStore: AnalyticsEvent[] = [];

export async function insertEvents(events: AnalyticsEvent[]): Promise<boolean> {
  const supabase = getSupabase();

  if (supabase) {
    const rows = events.map(e => ({
      event_type: e.event_type,
      page_url: e.page_url,
      page_title: e.page_title || null,
      element_tag: e.element_tag || null,
      element_class: e.element_class || null,
      element_id: e.element_id || null,
      element_text: e.element_text || null,
      x_pos: e.x_pos ?? null,
      y_pos: e.y_pos ?? null,
      scroll_depth: e.scroll_depth ?? null,
      session_id: e.session_id,
      user_agent: e.user_agent || null,
      referrer: e.referrer || null,
      viewport_width: e.viewport_width ?? null,
      viewport_height: e.viewport_height ?? null,
      time_on_page: e.time_on_page ?? null,
      created_at: e.created_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from('analytics_events').insert(rows);
    if (error) {
      console.error('[Analytics] Supabase insert error:', error.message);
      memoryStore.push(...events);
      return false;
    }
    return true;
  }

  memoryStore.push(...events);
  return true;
}

export async function queryEvents(params: {
  page_url?: string;
  event_type?: string;
  days?: number;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  const supabase = getSupabase();
  const { page_url, event_type, days, limit = 10000 } = params;

  const cutoff = days !== undefined && days > 0
    ? new Date(Date.now() - days * 86400000).toISOString()
    : days === 0
      ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      : undefined;

  if (supabase) {
    let query = supabase
      .from('analytics_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (page_url) query = query.eq('page_url', page_url);
    if (event_type) query = query.eq('event_type', event_type);
    if (cutoff) query = query.gte('created_at', cutoff);

    const { data, error } = await query;
    if (error) {
      console.error('[Analytics] Supabase query error:', error.message);
      return filterMemory(memoryStore, params);
    }
    return data as AnalyticsEvent[];
  }

  return filterMemory(memoryStore, params);
}

function filterMemory(
  store: AnalyticsEvent[],
  params: { page_url?: string; event_type?: string; days?: number; limit?: number }
): AnalyticsEvent[] {
  let results = [...store];
  const { page_url, event_type, days, limit = 10000 } = params;

  if (page_url) results = results.filter(e => e.page_url === page_url);
  if (event_type) results = results.filter(e => e.event_type === event_type);

  if (days !== undefined) {
    const cutoff = days > 0
      ? Date.now() - days * 86400000
      : new Date().setHours(0, 0, 0, 0);
    results = results.filter(e => {
      const t = e.created_at ? new Date(e.created_at).getTime() : 0;
      return t >= cutoff;
    });
  }

  results.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return results.slice(0, limit);
}

export function getMemoryStoreSize(): number {
  return memoryStore.length;
}

export async function getDistinctPages(days?: number): Promise<string[]> {
  const supabase = getSupabase();

  if (supabase) {
    const cutoff = days !== undefined && days > 0
      ? new Date(Date.now() - days * 86400000).toISOString()
      : days === 0
        ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        : undefined;

    let query = supabase
      .from('analytics_events')
      .select('page_url')
      .not('page_url', 'is', null);

    if (cutoff) query = query.gte('created_at', cutoff);

    const { data } = await query;
    if (data) {
      const unique = Array.from(new Set(data.map((r: { page_url: string }) => r.page_url)));
      return unique;
    }
  }

  const unique = Array.from(new Set(memoryStore.map(e => e.page_url)));
  return unique;
}
