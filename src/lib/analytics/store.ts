import type { AnalyticsEvent, VisitorStats } from './types';
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
      utm_source: e.utm_source || null,
      utm_medium: e.utm_medium || null,
      utm_campaign: e.utm_campaign || null,
      device_type: e.device_type || null,
      browser: e.browser || null,
      os: e.os || null,
      screen_width: e.screen_width ?? null,
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

export async function getStats(days: number = 30): Promise<VisitorStats> {
  // 어제와의 비교를 위해 최소 2일간의 데이터를 가져옵니다.
  const fetchDays = days === 0 ? 2 : Math.max(days, 2);
  const allEvents = await queryEvents({ days: fetchDays, limit: 100000 });
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const yesterdayEnd = todayStart - 1;

  const todayPVs = allEvents.filter(e => e.event_type === 'page_view' && new Date(e.created_at!).getTime() >= todayStart);
  const yesterdayPVs = allEvents.filter(e => e.event_type === 'page_view' && new Date(e.created_at!).getTime() >= yesterdayStart && new Date(e.created_at!).getTime() <= yesterdayEnd);

  const todaySessions = new Set(todayPVs.map(p => p.session_id)).size;
  const yesterdaySessions = new Set(yesterdayPVs.map(p => p.session_id)).size;

  const change = yesterdaySessions === 0 ? (todaySessions > 0 ? 100 : 0) : Math.round(((todaySessions - yesterdaySessions) / yesterdaySessions) * 100);

  const leaves = allEvents.filter(e => e.event_type === 'page_leave');
  const avgDuration = leaves.length === 0 ? 0 : Math.round(leaves.reduce((s, e) => s + (e.time_on_page || 0), 0) / leaves.length);

  const allSessions = new Set(allEvents.map(e => e.session_id));
  const multiPageSessions = new Set(allEvents.filter(e => e.event_type === 'page_view').map(e => e.session_id)).size;
  const bounceRate = allSessions.size === 0 ? 0 : Math.round(((allSessions.size - multiPageSessions) / allSessions.size) * 100);

  const pageCounts: Record<string, number> = {};
  allEvents.filter(e => e.event_type === 'page_view').forEach(e => {
    pageCounts[e.page_url] = (pageCounts[e.page_url] || 0) + 1;
  });
  const topPage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '/';

  return {
    today_visitors: todaySessions,
    yesterday_visitors: yesterdaySessions,
    visitor_change_pct: change,
    avg_duration: avgDuration,
    bounce_rate: bounceRate,
    top_page: topPage,
  };
}

export async function getChartData(days: number = 30) {
  const events = await queryEvents({ days, limit: 100000 });
  const pvs = events.filter(e => e.event_type === 'page_view');

  // 일별 방문자 추이
  const daily: Record<string, Set<string>> = {};
  for (let i = days; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    daily[date] = new Set();
  }
  pvs.forEach(e => {
    const date = e.created_at!.split('T')[0];
    if (daily[date]) daily[date].add(e.session_id);
  });
  const visitorsTrend = Object.entries(daily).map(([name, set]) => ({ name, value: set.size }));

  // 유입 경로
  const referrers: Record<string, number> = {};
  pvs.forEach(e => {
    let ref = 'Direct';
    if (e.utm_source) ref = e.utm_source;
    else if (e.referrer) {
      try {
        const url = new URL(e.referrer);
        ref = url.hostname;
      } catch { ref = 'Other'; }
    }
    referrers[ref] = (referrers[ref] || 0) + 1;
  });
  const referralSources = Object.entries(referrers).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);

  // 디바이스 분포
  const devices: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
  pvs.forEach(e => {
    const d = e.device_type || 'desktop';
    devices[d] = (devices[d] || 0) + 1;
  });
  const deviceDist = Object.entries(devices).map(([name, value]) => ({ name, value }));

  // 시간대별 분포
  const hourly = Array(24).fill(0).map((_, i) => ({ name: `${i}시`, value: 0 }));
  pvs.forEach(e => {
    const hour = new Date(e.created_at!).getHours();
    hourly[hour].value++;
  });

  // 페이지별 체류시간
  const pageDurations: Record<string, { total: number, count: number }> = {};
  events.filter(e => e.event_type === 'page_leave').forEach(e => {
    if (!pageDurations[e.page_url]) pageDurations[e.page_url] = { total: 0, count: 0 };
    pageDurations[e.page_url].total += (e.time_on_page || 0);
    pageDurations[e.page_url].count++;
  });
  const topDurations = Object.entries(pageDurations)
    .map(([name, d]) => ({ name, value: Math.round(d.total / d.count) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return { visitorsTrend, referralSources, deviceDist, hourly, topDurations };
}
