import type { AnalyticsEvent, VisitorStats } from './types';
import { getSupabase } from './supabase';

const memoryStore: AnalyticsEvent[] = [];

export async function insertEvents(events: AnalyticsEvent[]): Promise<boolean> {
  const supabase = getSupabase();

  if (supabase) {
    // 1. analytics_events 테이블에 저장 (기존 로직)
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

    const { error: eventsError } = await supabase.from('analytics_events').insert(rows);
    if (eventsError) {
      console.error('[Analytics] Supabase insert error:', eventsError.message);
      memoryStore.push(...events);
      return false;
    }

    // 2. page_view 이벤트가 있으면 page_views 테이블에 저장
    const pageViews = events.filter(e => e.event_type === 'page_view');
    if (pageViews.length > 0) {
      const pvRows = pageViews.map(e => ({
        session_id: e.session_id,
        page_url: e.page_url,
        referrer: e.referrer || null,
        utm_source: e.utm_source || null,
        utm_medium: e.utm_medium || null,
        utm_campaign: e.utm_campaign || null,
        device_type: (e.device_type || 'desktop') as 'mobile' | 'tablet' | 'desktop',
        browser: e.browser || 'Unknown',
        os: e.os || 'Unknown',
        screen_width: e.screen_width || e.viewport_width || 1920,
        duration_seconds: 0,
        is_bounce: true,
        created_at: e.created_at || new Date().toISOString(),
      }));

      const { error: pvError } = await supabase.from('page_views').insert(pvRows);
      if (pvError) {
        console.error('[Analytics] Page views insert error:', pvError.message);
        // page_views 저장 실패해도 analytics_events는 저장되었으므로 계속 진행
      }
    }

    // 3. page_leave 이벤트가 있으면 page_views 테이블 업데이트
    const pageLeaves = events.filter(e => e.event_type === 'page_leave');
    for (const leave of pageLeaves) {
      try {
        // 해당 세션의 가장 최근 page_view 레코드 찾기 (같은 페이지 URL)
        const { data: recentPV } = await supabase
          .from('page_views')
          .select('id')
          .eq('session_id', leave.session_id)
          .eq('page_url', leave.page_url)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentPV && recentPV.id) {
          // 같은 세션 내 다른 페이지 방문 여부 확인 (이탈률 계산)
          const { data: otherPages } = await supabase
            .from('page_views')
            .select('id')
            .eq('session_id', leave.session_id)
            .neq('page_url', leave.page_url)
            .limit(1);

          const isBounce = !otherPages || otherPages.length === 0;

          await supabase
            .from('page_views')
            .update({
              duration_seconds: leave.time_on_page || 0,
              is_bounce: isBounce,
            })
            .eq('id', recentPV.id);
        }
      } catch (err) {
        console.error('[Analytics] Page leave update error:', err);
        // 업데이트 실패해도 계속 진행
      }
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

    // page_views 테이블에서 조회 시도
    try {
      let query = supabase
        .from('page_views')
        .select('page_url')
        .not('page_url', 'is', null)
        .not('page_url', 'ilike', '/admin/%'); // 관리자 페이지 제외

      if (cutoff) query = query.gte('created_at', cutoff);

      const { data } = await query;
      if (data && data.length > 0) {
        const unique = Array.from(new Set(data.map((r: { page_url: string }) => r.page_url)));
        return unique;
      }
    } catch (err) {
      console.error('[Analytics] getDistinctPages error:', err);
      // Fallback to analytics_events
    }

    // Fallback: analytics_events 테이블 사용
    let query = supabase
      .from('analytics_events')
      .select('page_url')
      .not('page_url', 'is', null)
      .not('page_url', 'ilike', '/admin/%'); // 관리자 페이지 제외

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
  const supabase = getSupabase();
  const fetchDays = days === 0 ? 2 : Math.max(days, 2);
  const cutoff = new Date(Date.now() - fetchDays * 86400000).toISOString();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const yesterdayEnd = todayStart - 1;

  // page_views 테이블에서 데이터 조회 (더 정확한 데이터)
  if (supabase) {
    try {
      const { data: allPVs, error } = await supabase
        .from('page_views')
        .select('*')
        .gte('created_at', cutoff);

      if (!error && allPVs) {
        // 데이터가 없어도 처리
        if (allPVs.length === 0) {
          return {
            today_visitors: 0,
            yesterday_visitors: 0,
            visitor_change_pct: 0,
            avg_duration: 0,
            bounce_rate: 0,
            top_page: '/',
          };
        }

        const todayPVs = allPVs.filter((pv: any) =>
          new Date(pv.created_at).getTime() >= todayStart
        );
        const yesterdayPVs = allPVs.filter((pv: any) => {
          const t = new Date(pv.created_at).getTime();
          return t >= yesterdayStart && t <= yesterdayEnd;
        });

        const todaySessions = new Set(todayPVs.map((p: any) => p.session_id)).size;
        const yesterdaySessions = new Set(yesterdayPVs.map((p: any) => p.session_id)).size;
        const change = yesterdaySessions === 0
          ? (todaySessions > 0 ? 100 : 0)
          : Math.round(((todaySessions - yesterdaySessions) / yesterdaySessions) * 100);

        // 평균 체류시간
        const avgDuration = todayPVs.length === 0
          ? 0
          : Math.round(todayPVs.reduce((s: number, p: any) => s + (p.duration_seconds || 0), 0) / todayPVs.length);

        // 이탈률 (bounce rate)
        const bounceCount = todayPVs.filter((p: any) => p.is_bounce).length;
        const bounceRate = todayPVs.length === 0
          ? 0
          : Math.round((bounceCount / todayPVs.length) * 100);

        // 가장 많이 본 페이지
        const pageCounts: Record<string, number> = {};
        todayPVs.forEach((pv: any) => {
          pageCounts[pv.page_url] = (pageCounts[pv.page_url] || 0) + 1;
        });
        const topPage = Object.entries(pageCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || '/';

        return {
          today_visitors: todaySessions,
          yesterday_visitors: yesterdaySessions,
          visitor_change_pct: change,
          avg_duration: avgDuration,
          bounce_rate: bounceRate,
          top_page: topPage,
        };
      }
    } catch (err) {
      console.error('[Analytics] getStats error:', err);
      // Fallback to analytics_events
    }
  }

  // Fallback: analytics_events 테이블 사용 (기존 로직)
  const allEvents = await queryEvents({ days: fetchDays, limit: 100000 });
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
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // page_views 테이블에서 데이터 조회 (더 정확한 데이터)
  if (supabase) {
    try {
      const { data: allPVs, error } = await supabase
        .from('page_views')
        .select('*')
        .gte('created_at', cutoff);

      if (!error && allPVs) {
        // 데이터가 없어도 기본 구조 반환
        if (allPVs.length === 0) {
          const daily: Record<string, Set<string>> = {};
          for (let i = days; i >= 0; i--) {
            const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            daily[date] = new Set();
          }
          return {
            visitorsTrend: Object.entries(daily).map(([name]) => ({ name, value: 0 })),
            referralSources: [],
            deviceDist: [
              { name: 'desktop', value: 0 },
              { name: 'mobile', value: 0 },
              { name: 'tablet', value: 0 },
            ],
            hourly: Array(24).fill(0).map((_, i) => ({ name: `${i}시`, value: 0 })),
            topDurations: [],
          };
        }

        // 일별 방문자 추이
        const daily: Record<string, Set<string>> = {};
        for (let i = days; i >= 0; i--) {
          const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
          daily[date] = new Set();
        }
        allPVs.forEach((pv: any) => {
          const date = pv.created_at.split('T')[0];
          if (daily[date]) daily[date].add(pv.session_id);
        });
        const visitorsTrend = Object.entries(daily).map(([name, set]) => ({ name, value: set.size }));

        // 유입 경로
        const referrers: Record<string, number> = {};
        allPVs.forEach((pv: any) => {
          let ref = 'Direct';
          if (pv.utm_source) ref = pv.utm_source;
          else if (pv.referrer) {
            try {
              const url = new URL(pv.referrer);
              ref = url.hostname;
            } catch { ref = 'Other'; }
          }
          referrers[ref] = (referrers[ref] || 0) + 1;
        });
        const referralSources = Object.entries(referrers)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        // 디바이스 분포
        const devices: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
        allPVs.forEach((pv: any) => {
          const d = pv.device_type || 'desktop';
          devices[d] = (devices[d] || 0) + 1;
        });
        const deviceDist = Object.entries(devices).map(([name, value]) => ({ name, value }));

        // 시간대별 분포
        const hourly = Array(24).fill(0).map((_, i) => ({ name: `${i}시`, value: 0 }));
        allPVs.forEach((pv: any) => {
          const hour = new Date(pv.created_at).getHours();
          hourly[hour].value++;
        });

        // 페이지별 체류시간
        const pageDurations: Record<string, { total: number, count: number }> = {};
        allPVs.forEach((pv: any) => {
          if (!pageDurations[pv.page_url]) {
            pageDurations[pv.page_url] = { total: 0, count: 0 };
          }
          pageDurations[pv.page_url].total += (pv.duration_seconds || 0);
          pageDurations[pv.page_url].count++;
        });
        const topDurations = Object.entries(pageDurations)
          .map(([name, d]) => ({ name, value: Math.round(d.total / d.count) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        return { visitorsTrend, referralSources, deviceDist, hourly, topDurations };
      }
    } catch (err) {
      console.error('[Analytics] getChartData error:', err);
      // Fallback to analytics_events
    }
  }

  // Fallback: analytics_events 테이블 사용 (기존 로직)
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

/**
 * Get A/B experiment results
 */
export async function getABExperimentResults(): Promise<any[] | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[Analytics] Supabase client not initialized');
    return { error: 'Supabase configuration is missing. Please check .env.local' };
  }

  try {
    // 1. 모든 활성 실험 설정 가져오기
    const { data: experiments, error: expError } = await supabase
      .from('ab_experiments')
      .select('*')
      .order('created_at', { ascending: false });

    if (expError) {
      console.error('[Analytics] fetching ab_experiments error:', expError.message);
    }

    // 2. 모든 이벤트 데이터 가져오기
    const { data: events, error } = await supabase
      .from('ab_events')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Analytics] getABExperimentResults error:', error.message);
    }

    const results: Record<string, {
      name: string;
      _meta: Record<string, any>; // DB 원본 실험 설정 보존
      variants: {
        A: { impressions: number; clicks: number };
        B: { impressions: number; clicks: number };
      };
    }> = {};

    // DB에 저장된 실험 목록으로 결과 맵 초기화 (원본 메타데이터 보존)
    if (experiments) {
      experiments.forEach(exp => {
        results[exp.name] = {
          name: exp.name,
          _meta: exp, // status, traffic_allocation, target_sample_size 등 보존
          variants: {
            A: { impressions: 0, clicks: 0 },
            B: { impressions: 0, clicks: 0 },
          }
        };
      });
    }

    // 이벤트 데이터를 순회하며 수치 합산
    if (events) {
      events.forEach(e => {
        // 이미 결과 맵에 있는 실험인 경우에만 집계
        // DB에 없는 실험(孤立 이벤트)은 _meta 없이 추가
        if (!results[e.experiment_name]) {
          results[e.experiment_name] = {
            name: e.experiment_name,
            _meta: { name: e.experiment_name },
            variants: {
              A: { impressions: 0, clicks: 0 },
              B: { impressions: 0, clicks: 0 },
            }
          };
        }

        const variant = e.variant as 'A' | 'B';
        // 잘못된 variant 값이 들어온 경우 대비
        if (variant !== 'A' && variant !== 'B') return;

        if (e.event_type === 'impression') {
          results[e.experiment_name].variants[variant].impressions++;
        } else if (e.event_type === 'click') {
          results[e.experiment_name].variants[variant].clicks++;
        }
      });
    }

    return Object.values(results).map(exp => {
      const vA = exp.variants.A;
      const vB = exp.variants.B;
      const meta = exp._meta || {};

      const ctrA = vA.impressions > 0 ? (vA.clicks / vA.impressions) * 100 : 0;
      const ctrB = vB.impressions > 0 ? (vB.clicks / vB.impressions) * 100 : 0;

      // 통계적 유의미성 검정 (p-value 계산)
      const pValue = calculateChiSquared(vA.impressions, vA.clicks, vB.impressions, vB.clicks);

      return {
        // DB 원본 메타데이터 스프레드 (snake_case 필드들 포함)
        ...meta,
        // 명시적 camelCase 매핑 (UI 인터페이스와 일치)
        name: exp.name,
        status: meta.status || 'running',
        trafficAllocation: meta.traffic_allocation ?? 50,
        targetSampleSize: meta.target_sample_size ?? 1000,
        startDate: meta.start_date || null,
        // 집계된 통계 데이터
        variants: {
          A: { ...vA, ctr: ctrA },
          B: { ...vB, ctr: ctrB },
        },
        pValue,
        isSignificant: pValue < 0.05,
        winner: ctrA > ctrB ? 'A' : (ctrB > ctrA ? 'B' : 'Draw'),
      };
    });
  } catch (err) {
    console.error('[Analytics] getABExperimentResults exception:', err);
    return [];
  }
}

/**
 * Rage Click 목록 집계 (같은 좌표 ±30px 반경으로 그루핑)
 */
export async function getRageClicks(params: {
  page_url?: string;
  days?: number;
}): Promise<import('./types').RageClickEntry[]> {
  const events = await queryEvents({ ...params, event_type: 'rage_click', limit: 5000 });
  const groups: import('./types').RageClickEntry[] = [];

  for (const e of events) {
    if (e.x_pos == null || e.y_pos == null) continue;
    const existing = groups.find(
      g => Math.abs(g.x_pos - e.x_pos!) < 30 && Math.abs(g.y_pos - e.y_pos!) < 30
        && g.page_url === e.page_url
    );
    if (existing) {
      existing.count++;
      if (e.created_at && e.created_at > existing.last_occurred) {
        existing.last_occurred = e.created_at;
      }
    } else {
      groups.push({
        x_pos: e.x_pos,
        y_pos: e.y_pos,
        element_info: [e.element_tag, e.element_text?.slice(0, 30)].filter(Boolean).join(' '),
        page_url: e.page_url,
        count: 1,
        last_occurred: e.created_at || '',
      });
    }
  }

  return groups.sort((a, b) => b.count - a.count).slice(0, 50);
}

/**
 * 스크롤 깊이 분포 (25/50/75/100% 각 도달 세션 수)
 */
export async function getScrollDepthStats(params: {
  page_url?: string;
  days?: number;
}): Promise<import('./types').ScrollDepthData[]> {
  const events = await queryEvents({ ...params, event_type: 'scroll', limit: 10000 });

  // 세션별 최대 스크롤 깊이 집계
  const sessionDepths = new Map<string, number>();
  for (const e of events) {
    const cur = sessionDepths.get(e.session_id) ?? 0;
    if ((e.scroll_depth ?? 0) > cur) {
      sessionDepths.set(e.session_id, e.scroll_depth ?? 0);
    }
  }

  const total = sessionDepths.size || 1;

  return [25, 50, 75, 100].map(depth => {
    const count = [...sessionDepths.values()].filter(d => d >= depth).length;
    return { depth, count, percentage: Math.round((count / total) * 100) };
  });
}

/**
 * Simple Chi-squared test for 2x2 table
 */
function calculateChiSquared(n1: number, x1: number, n2: number, x2: number): number {
  if (n1 === 0 || n2 === 0) return 1;

  const o11 = x1;
  const o12 = n1 - x1;
  const o21 = x2;
  const o22 = n2 - x2;

  const row1 = o11 + o12;
  const row2 = o21 + o22;
  const col1 = o11 + o21;
  const col2 = o12 + o22;
  const total = row1 + row2;

  if (total === 0 || col1 === 0 || col2 === 0) return 1;

  const e11 = (row1 * col1) / total;
  const e12 = (row1 * col2) / total;
  const e21 = (row2 * col1) / total;
  const e22 = (row2 * col2) / total;

  const chiSq =
    Math.pow(o11 - e11, 2) / e11 +
    Math.pow(o12 - e12, 2) / e12 +
    Math.pow(o21 - e21, 2) / e21 +
    Math.pow(o22 - e22, 2) / e22;

  // df = 1, alpha = 0.05 critical value = 3.841
  // We return a p-value approximation (very simple)
  if (chiSq > 10.83) return 0.001;
  if (chiSq > 6.63) return 0.01;
  if (chiSq > 3.84) return 0.05;
  if (chiSq > 2.71) return 0.1;
  return 1;
}
