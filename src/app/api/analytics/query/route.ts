import { NextRequest, NextResponse } from 'next/server';
import { queryEvents, getDistinctPages, getStats, getChartData, getABExperimentResults } from '@/lib/analytics/store';
import { getSupabase } from '@/lib/analytics/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'pages') {
      const days = searchParams.get('days');
      const pages = await getDistinctPages(days ? parseInt(days) : undefined);
      return NextResponse.json({ pages });
    }

    if (action === 'stats') {
      const days = searchParams.get('days');
      const stats = await getStats(days ? parseInt(days) : 30);
      return NextResponse.json(stats);
    }

    if (action === 'charts') {
      const days = searchParams.get('days');
      const charts = await getChartData(days ? parseInt(days) : 30);
      return NextResponse.json(charts);
    }

    if (action === 'ab-results') {
      try {
        const results = await getABExperimentResults();
        if (results && 'error' in results) {
          return NextResponse.json(results);
        }
        return NextResponse.json({ experiments: results || [] });
      } catch (err) {
        console.error('[Analytics Query] ab-results error:', err);
        return NextResponse.json({ experiments: [], error: 'Failed to fetch A/B test results' });
      }
    }

    // ===== type=demographics =====
    if (action === 'demographics') {
      const supabase = getSupabase();
      const days = parseInt(searchParams.get('days') || '30');
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();

      let ageGroups: { name: string; value: number }[] = [];
      let genders: { name: string; value: number }[] = [];
      let languages: { name: string; value: number }[] = [];
      let screenResolutions: { name: string; value: number }[] = [];
      let browsers: { name: string; value: number }[] = [];
      let operatingSystems: { name: string; value: number }[] = [];
      let connectionTypes: { name: string; value: number }[] = [];
      let touchSupport = 0;
      let cookiesEnabled = 100;

      if (supabase) {
        // Age groups from visitor_profiles
        try {
          const { data } = await supabase
            .from('visitor_profiles')
            .select('estimated_age_group')
            .gte('created_at', cutoff);
          if (data && data.length > 0) {
            const counts: Record<string, number> = {};
            data.forEach((r: any) => {
              const g = r.estimated_age_group || 'unknown';
              counts[g] = (counts[g] || 0) + 1;
            });
            ageGroups = Object.entries(counts).map(([name, value]) => ({ name, value }));
          }
        } catch (err) {
          console.error('[Demographics] age groups error:', err);
        }

        // Gender distribution from visitor_profiles
        try {
          const { data } = await supabase
            .from('visitor_profiles')
            .select('estimated_gender')
            .gte('created_at', cutoff);
          if (data && data.length > 0) {
            const counts: Record<string, number> = {};
            data.forEach((r: any) => {
              const g = r.estimated_gender || 'unknown';
              counts[g] = (counts[g] || 0) + 1;
            });
            genders = Object.entries(counts).map(([name, value]) => ({ name, value }));
          }
        } catch (err) {
          console.error('[Demographics] genders error:', err);
        }

        // Languages from visitor_profiles
        try {
          const { data } = await supabase
            .from('visitor_profiles')
            .select('language')
            .gte('created_at', cutoff);
          if (data && data.length > 0) {
            const counts: Record<string, number> = {};
            data.forEach((r: any) => {
              const lang = r.language || 'unknown';
              counts[lang] = (counts[lang] || 0) + 1;
            });
            languages = Object.entries(counts)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 10);
          }
        } catch (err) {
          console.error('[Demographics] languages error:', err);
        }

        // Screen resolutions from visitor_profiles
        try {
          const { data } = await supabase
            .from('visitor_profiles')
            .select('screen_resolution')
            .gte('created_at', cutoff);
          if (data && data.length > 0) {
            const counts: Record<string, number> = {};
            data.forEach((r: any) => {
              const res = r.screen_resolution || 'unknown';
              counts[res] = (counts[res] || 0) + 1;
            });
            screenResolutions = Object.entries(counts)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 10);
          }
        } catch (err) {
          console.error('[Demographics] screen resolutions error:', err);
        }

        // Browser distribution from analytics_events
        try {
          const { data } = await supabase
            .from('analytics_events')
            .select('browser')
            .gte('created_at', cutoff)
            .eq('event_type', 'page_view');
          if (data && data.length > 0) {
            const counts: Record<string, number> = {};
            data.forEach((r: any) => {
              const b = r.browser || 'Unknown';
              counts[b] = (counts[b] || 0) + 1;
            });
            browsers = Object.entries(counts)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value);
          }
        } catch (err) {
          console.error('[Demographics] browsers error:', err);
        }

        // OS distribution from analytics_events
        try {
          const { data } = await supabase
            .from('analytics_events')
            .select('os')
            .gte('created_at', cutoff)
            .eq('event_type', 'page_view');
          if (data && data.length > 0) {
            const counts: Record<string, number> = {};
            data.forEach((r: any) => {
              const o = r.os || 'Unknown';
              counts[o] = (counts[o] || 0) + 1;
            });
            operatingSystems = Object.entries(counts)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value);
          }
        } catch (err) {
          console.error('[Demographics] OS error:', err);
        }

        // Connection types from visitor_profiles
        try {
          const { data } = await supabase
            .from('visitor_profiles')
            .select('connection_type')
            .gte('created_at', cutoff);
          if (data && data.length > 0) {
            const counts: Record<string, number> = {};
            data.forEach((r: any) => {
              const ct = r.connection_type || 'unknown';
              counts[ct] = (counts[ct] || 0) + 1;
            });
            connectionTypes = Object.entries(counts)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value);
          }
        } catch (err) {
          console.error('[Demographics] connection types error:', err);
        }

        // Touch support percentage from visitor_profiles
        try {
          const { data } = await supabase
            .from('visitor_profiles')
            .select('touch_support')
            .gte('created_at', cutoff);
          if (data && data.length > 0) {
            const total = data.length;
            const supported = data.filter((r: any) => r.touch_support === true).length;
            touchSupport = total > 0 ? Math.round((supported / total) * 1000) / 10 : 0;
          }
        } catch (err) {
          console.error('[Demographics] touch support error:', err);
        }

        // Cookies enabled percentage from visitor_profiles
        try {
          const { data } = await supabase
            .from('visitor_profiles')
            .select('cookies_enabled')
            .gte('created_at', cutoff);
          if (data && data.length > 0) {
            const total = data.length;
            const enabled = data.filter((r: any) => r.cookies_enabled === true).length;
            cookiesEnabled = total > 0 ? Math.round((enabled / total) * 1000) / 10 : 100;
          }
        } catch (err) {
          console.error('[Demographics] cookies enabled error:', err);
        }
      }

      return NextResponse.json({
        ageGroups,
        genders,
        languages,
        screenResolutions,
        browsers,
        operatingSystems,
        connectionTypes,
        touchSupport,
        cookiesEnabled,
      });
    }

    // ===== type=funnels =====
    if (action === 'funnels') {
      const supabase = getSupabase();
      const days = parseInt(searchParams.get('days') || '30');
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();

      const funnelSteps = [
        { name: '랜딩 페이지', pattern: '/' },
        { name: '회원가입', pattern: '/signup' },
        { name: '첫 프로젝트', pattern: '/projects' },
        { name: '결제', pattern: '/payment' },
      ];

      const steps: { name: string; count: number; rate: number }[] = [];

      if (supabase) {
        let totalLanding = 0;
        for (let i = 0; i < funnelSteps.length; i++) {
          const step = funnelSteps[i];
          let count = 0;
          try {
            const { data, error } = await supabase
              .from('page_views')
              .select('id', { count: 'exact', head: true })
              .gte('created_at', cutoff)
              .ilike('page_url', `%${step.pattern}%`);

            if (!error && data !== null) {
              // When using head: true with count, the count comes from the response
              // We need to use a different approach
              const { count: rowCount } = await supabase
                .from('page_views')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', cutoff)
                .ilike('page_url', `%${step.pattern}%`);
              count = rowCount || 0;
            }
          } catch (err) {
            console.error(`[Funnels] step "${step.name}" error:`, err);
            count = 0;
          }

          if (i === 0) totalLanding = count || 1;
          const rate = totalLanding > 0 ? Math.round((count / totalLanding) * 100) : 0;
          steps.push({ name: step.name, count, rate });
        }
      } else {
        // No supabase - return placeholder data
        steps.push(
          { name: '랜딩 페이지', count: 0, rate: 100 },
          { name: '회원가입', count: 0, rate: 0 },
          { name: '첫 프로젝트', count: 0, rate: 0 },
          { name: '결제', count: 0, rate: 0 },
        );
      }

      return NextResponse.json({
        funnels: [{
          id: 'default',
          name: '가입 퍼널',
          steps,
        }],
      });
    }

    // ===== type=health =====
    if (action === 'health') {
      const supabase = getSupabase();
      const days = parseInt(searchParams.get('days') || '30');
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();

      let activeUsers = 0;
      let errorRate = 0;
      let avgResponseTime = 0;
      const uptime = 99.9;
      let webVitals = { lcp: 0, fcp: 0, cls: 0, ttfb: 0 };
      let jsErrors: { message: string; count: number; lastSeen: string }[] = [];
      let errorTrend: { date: string; errors: number }[] = [];
      let apiLatency: { date: string; latency: number }[] = [];

      if (supabase) {
        // Active users (distinct sessions in last 15 minutes)
        try {
          const recentCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const { data } = await supabase
            .from('analytics_events')
            .select('session_id')
            .gte('created_at', recentCutoff);
          if (data) {
            activeUsers = new Set(data.map((r: any) => r.session_id)).size;
          }
        } catch (err) {
          console.error('[Health] active users error:', err);
        }

        // JS Errors from js_errors table
        try {
          const { data } = await supabase
            .from('js_errors')
            .select('*')
            .gte('created_at', cutoff)
            .order('created_at', { ascending: false })
            .limit(500);
          if (data && data.length > 0) {
            // Aggregate by error message
            const errMap: Record<string, { count: number; lastSeen: string }> = {};
            data.forEach((r: any) => {
              const msg = r.message || r.error_message || 'Unknown error';
              if (!errMap[msg]) {
                errMap[msg] = { count: 0, lastSeen: r.created_at };
              }
              errMap[msg].count++;
              if (r.created_at > errMap[msg].lastSeen) {
                errMap[msg].lastSeen = r.created_at;
              }
            });
            jsErrors = Object.entries(errMap)
              .map(([message, info]) => ({ message, count: info.count, lastSeen: info.lastSeen }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 20);

            // Error rate: errors per total page views
            try {
              const { count: pvCount } = await supabase
                .from('analytics_events')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', cutoff)
                .eq('event_type', 'page_view');
              const totalPV = pvCount || 1;
              errorRate = Math.round((data.length / totalPV) * 1000) / 10;
            } catch {
              errorRate = 0;
            }

            // Error trend by date
            const trendMap: Record<string, number> = {};
            data.forEach((r: any) => {
              const date = (r.created_at || '').substring(5, 10); // MM-DD
              trendMap[date] = (trendMap[date] || 0) + 1;
            });
            errorTrend = Object.entries(trendMap)
              .map(([date, errors]) => ({ date, errors }))
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(-14);
          }
        } catch (err) {
          console.error('[Health] js_errors error:', err);
        }

        // Web Vitals from web_vitals table
        try {
          const { data } = await supabase
            .from('web_vitals')
            .select('*')
            .gte('created_at', cutoff)
            .limit(1000);
          if (data && data.length > 0) {
            const vitals = { lcp: 0, fcp: 0, cls: 0, ttfb: 0, lcpCount: 0, fcpCount: 0, clsCount: 0, ttfbCount: 0 };
            data.forEach((r: any) => {
              if (r.lcp !== null && r.lcp !== undefined) { vitals.lcp += r.lcp; vitals.lcpCount++; }
              if (r.fcp !== null && r.fcp !== undefined) { vitals.fcp += r.fcp; vitals.fcpCount++; }
              if (r.cls !== null && r.cls !== undefined) { vitals.cls += r.cls; vitals.clsCount++; }
              if (r.ttfb !== null && r.ttfb !== undefined) { vitals.ttfb += r.ttfb; vitals.ttfbCount++; }
            });
            webVitals = {
              lcp: vitals.lcpCount > 0 ? Math.round((vitals.lcp / vitals.lcpCount) * 100) / 100 : 0,
              fcp: vitals.fcpCount > 0 ? Math.round((vitals.fcp / vitals.fcpCount) * 100) / 100 : 0,
              cls: vitals.clsCount > 0 ? Math.round((vitals.cls / vitals.clsCount) * 1000) / 1000 : 0,
              ttfb: vitals.ttfbCount > 0 ? Math.round((vitals.ttfb / vitals.ttfbCount) * 100) / 100 : 0,
            };
          }
        } catch (err) {
          console.error('[Health] web_vitals error:', err);
        }

        // Average response time from performance events
        try {
          const { data } = await supabase
            .from('analytics_events')
            .select('time_on_page')
            .gte('created_at', cutoff)
            .eq('event_type', 'performance')
            .not('time_on_page', 'is', null)
            .limit(500);
          if (data && data.length > 0) {
            const sum = data.reduce((s: number, r: any) => s + (r.time_on_page || 0), 0);
            avgResponseTime = Math.round(sum / data.length);
          }
        } catch (err) {
          console.error('[Health] avg response time error:', err);
        }

        // API latency trend (from performance events grouped by date)
        try {
          const { data } = await supabase
            .from('analytics_events')
            .select('created_at, time_on_page')
            .gte('created_at', cutoff)
            .eq('event_type', 'performance')
            .not('time_on_page', 'is', null)
            .order('created_at', { ascending: true })
            .limit(1000);
          if (data && data.length > 0) {
            const latencyMap: Record<string, { total: number; count: number }> = {};
            data.forEach((r: any) => {
              const date = (r.created_at || '').substring(5, 10);
              if (!latencyMap[date]) latencyMap[date] = { total: 0, count: 0 };
              latencyMap[date].total += r.time_on_page || 0;
              latencyMap[date].count++;
            });
            apiLatency = Object.entries(latencyMap)
              .map(([date, d]) => ({ date, latency: Math.round(d.total / d.count) }))
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(-14);
          }
        } catch (err) {
          console.error('[Health] api latency error:', err);
        }
      }

      return NextResponse.json({
        activeUsers,
        errorRate,
        avgResponseTime,
        uptime,
        webVitals,
        jsErrors,
        errorTrend,
        apiLatency,
      });
    }

    // ===== type=editing_data =====
    if (action === 'editing_data') {
      const supabase = getSupabase();
      const days = parseInt(searchParams.get('days') || '30');
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();

      if (!supabase) {
        return NextResponse.json({ error: 'no_supabase' }, { status: 500 });
      }

      let total_actions = 0;
      let unique_sessions = 0;
      let action_breakdown: { action_type: string; count: number }[] = [];
      let hourly_activity: { hour: number; count: number }[] = [];
      let top_projects: { project_id: string; total_actions: number; total_duration: number; clip_count: number }[] = [];
      let media_type_distribution: { media_type: string; count: number }[] = [];
      let daily_trend: { date: string; actions: number; sessions: number }[] = [];
      let editing_efficiency = { avg_actions_per_minute: 0, avg_editing_duration: 0, total_exports: 0 };
      let templates: { id: string; name: string; category: string; popularity_score: number; is_premium: boolean }[] = [];

      try {
        // Total actions & unique sessions
        const { data: actions } = await supabase
          .from('editing_actions')
          .select('session_id, action_type, clip_media_type, target_track, created_at, project_id, clip_count, clip_duration')
          .gte('created_at', cutoff);

        if (actions && actions.length > 0) {
          total_actions = actions.length;
          const sessionSet = new Set(actions.map((a: any) => a.session_id));
          unique_sessions = sessionSet.size;

          // Action breakdown
          const actionMap: Record<string, number> = {};
          actions.forEach((a: any) => { actionMap[a.action_type] = (actionMap[a.action_type] || 0) + 1; });
          action_breakdown = Object.entries(actionMap).map(([action_type, count]) => ({ action_type, count })).sort((a, b) => b.count - a.count);

          // Hourly activity
          const hourMap: Record<number, number> = {};
          actions.forEach((a: any) => {
            const h = new Date(a.created_at).getHours();
            hourMap[h] = (hourMap[h] || 0) + 1;
          });
          hourly_activity = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] || 0 }));

          // Media type distribution
          const mediaMap: Record<string, number> = {};
          actions.forEach((a: any) => {
            if (a.clip_media_type) mediaMap[a.clip_media_type] = (mediaMap[a.clip_media_type] || 0) + 1;
          });
          media_type_distribution = Object.entries(mediaMap).map(([media_type, count]) => ({ media_type, count }));

          // Top projects
          const projMap: Record<string, { total_actions: number; total_duration: number; clip_count: number }> = {};
          actions.forEach((a: any) => {
            const pid = a.project_id || 'unknown';
            if (!projMap[pid]) projMap[pid] = { total_actions: 0, total_duration: 0, clip_count: 0 };
            projMap[pid].total_actions++;
            if (a.clip_duration) projMap[pid].total_duration += a.clip_duration;
            if (a.clip_count) projMap[pid].clip_count = Math.max(projMap[pid].clip_count, a.clip_count);
          });
          top_projects = Object.entries(projMap).map(([project_id, d]) => ({ project_id, ...d }))
            .sort((a, b) => b.total_actions - a.total_actions).slice(0, 5);

          // Daily trend
          const dayMap: Record<string, { actions: number; sessions: Set<string> }> = {};
          actions.forEach((a: any) => {
            const d = new Date(a.created_at);
            const key = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
            if (!dayMap[key]) dayMap[key] = { actions: 0, sessions: new Set() };
            dayMap[key].actions++;
            dayMap[key].sessions.add(a.session_id);
          });
          daily_trend = Object.entries(dayMap).map(([date, d]) => ({ date, actions: d.actions, sessions: d.sessions.size }));

          // Export count
          editing_efficiency.total_exports = actionMap['export_complete'] || 0;
        }
      } catch (err) {
        console.error('[Editing Data] actions error:', err);
      }

      // Project summaries for efficiency stats
      try {
        const { data: summaries } = await supabase
          .from('project_summaries')
          .select('actions_per_minute, editing_duration')
          .gte('created_at', cutoff);
        if (summaries && summaries.length > 0) {
          const totalApm = summaries.reduce((s: number, r: any) => s + (r.actions_per_minute || 0), 0);
          const totalDur = summaries.reduce((s: number, r: any) => s + (r.editing_duration || 0), 0);
          editing_efficiency.avg_actions_per_minute = +(totalApm / summaries.length).toFixed(1);
          editing_efficiency.avg_editing_duration = Math.round(totalDur / summaries.length);
        }
      } catch {
        // silent
      }

      // Templates
      try {
        const { data: tpls } = await supabase
          .from('editing_templates')
          .select('id, name, category, popularity_score, is_premium')
          .order('popularity_score', { ascending: false })
          .limit(10);
        if (tpls) templates = tpls;
      } catch {
        // silent
      }

      return NextResponse.json({
        total_actions,
        unique_sessions,
        avg_actions_per_session: unique_sessions > 0 ? Math.round(total_actions / unique_sessions) : 0,
        action_breakdown,
        hourly_activity,
        top_projects,
        media_type_distribution,
        editing_efficiency,
        templates,
        daily_trend,
      });
    }

    const page_url = searchParams.get('page_url') || undefined;
    const event_type = searchParams.get('event_type') || undefined;
    const daysStr = searchParams.get('days');
    const days = daysStr !== null ? parseInt(daysStr) : undefined;
    const limitStr = searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr) : 10000;

    const events = await queryEvents({ page_url, event_type, days, limit });
    return NextResponse.json({ events, total: events.length });
  } catch (err) {
    console.error('[Analytics Query]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
