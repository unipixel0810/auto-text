import { getSupabase } from './supabase';

type Granularity = 'day' | 'week' | 'month';

interface RetentionParams {
  days: number;
  granularity: Granularity;
}

interface CohortRow {
  cohort: string;
  total: number;
  periods: number[];
}

interface RetentionResult {
  cohorts: CohortRow[];
}

/** Truncate a Date to the start of the given granularity (UTC). */
function truncateDate(date: Date, granularity: Granularity): string {
  const d = new Date(date);
  if (granularity === 'day') {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  if (granularity === 'week') {
    // Monday-based ISO week start
    const day = d.getUTCDay();
    const diff = day === 0 ? 6 : day - 1; // shift so Monday = 0
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  }
  // month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Calculate the period index between two truncated date strings. */
function periodIndex(cohortKey: string, activityKey: string, granularity: Granularity): number {
  const a = new Date(cohortKey);
  const b = new Date(activityKey);
  const diffMs = b.getTime() - a.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (granularity === 'day') return diffDays;
  if (granularity === 'week') return Math.round(diffDays / 7);
  // month – approximate
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
}

const EMPTY_RESULT: RetentionResult = { cohorts: [] };

export async function getRetentionData(params: RetentionParams): Promise<RetentionResult> {
  const { days, granularity } = params;
  const supabase = getSupabase();
  if (!supabase) return EMPTY_RESULT;

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  // 1. Fetch visitor_sessions in range
  let sessions: { visitor_id: string; session_id: string; first_seen_at: string; created_at: string }[];
  try {
    const { data, error } = await supabase
      .from('visitor_sessions')
      .select('visitor_id, session_id, first_seen_at, created_at')
      .gte('created_at', cutoff);
    if (error) {
      console.error('[Retention] visitor_sessions query error:', error.message);
      return EMPTY_RESULT;
    }
    sessions = data ?? [];
  } catch {
    // Table may not exist yet
    return EMPTY_RESULT;
  }

  if (sessions.length === 0) return EMPTY_RESULT;

  // 2. Collect all session_ids to batch-fetch page_views
  const sessionIds = [...new Set(sessions.map(s => s.session_id))];

  // Fetch page_views for those sessions (batch in chunks of 500 to avoid query limits)
  const CHUNK_SIZE = 500;
  const pageViewMap = new Map<string, string[]>(); // session_id -> [created_at, ...]

  for (let i = 0; i < sessionIds.length; i += CHUNK_SIZE) {
    const chunk = sessionIds.slice(i, i + CHUNK_SIZE);
    try {
      const { data, error } = await supabase
        .from('page_views')
        .select('session_id, created_at')
        .in('session_id', chunk);
      if (error) {
        console.error('[Retention] page_views query error:', error.message);
        continue;
      }
      for (const pv of data ?? []) {
        const list = pageViewMap.get(pv.session_id) ?? [];
        list.push(pv.created_at);
        pageViewMap.set(pv.session_id, list);
      }
    } catch {
      continue;
    }
  }

  // 3. Build visitor -> cohort mapping and activity dates
  const visitorCohort = new Map<string, string>(); // visitor_id -> cohort key
  const visitorActivity = new Map<string, Set<string>>(); // visitor_id -> set of period keys

  for (const s of sessions) {
    const cohortDate = s.first_seen_at ?? s.created_at;
    const cohortKey = truncateDate(new Date(cohortDate), granularity);

    if (!visitorCohort.has(s.visitor_id)) {
      visitorCohort.set(s.visitor_id, cohortKey);
      visitorActivity.set(s.visitor_id, new Set<string>());
    }

    // Add page_view activity dates for this session
    const pvDates = pageViewMap.get(s.session_id) ?? [];
    const activitySet = visitorActivity.get(s.visitor_id)!;
    for (const pvDate of pvDates) {
      activitySet.add(truncateDate(new Date(pvDate), granularity));
    }
    // Also count the session itself as activity
    activitySet.add(truncateDate(new Date(s.created_at), granularity));
  }

  // 4. Group visitors by cohort
  const cohortVisitors = new Map<string, string[]>(); // cohort key -> visitor_ids
  for (const [visitorId, cohortKey] of visitorCohort) {
    const list = cohortVisitors.get(cohortKey) ?? [];
    list.push(visitorId);
    cohortVisitors.set(cohortKey, list);
  }

  // 5. Determine max periods
  const sortedCohorts = [...cohortVisitors.keys()].sort();
  const now = new Date();
  const nowKey = truncateDate(now, granularity);

  // 6. Build cohort rows
  const cohorts: CohortRow[] = sortedCohorts.map(cohortKey => {
    const visitors = cohortVisitors.get(cohortKey)!;
    const total = visitors.length;
    const maxPeriod = periodIndex(cohortKey, nowKey, granularity);
    const periodCount = Math.min(maxPeriod + 1, 13); // cap at 13 periods (0..12)

    const periods: number[] = [];
    for (let p = 0; p < periodCount; p++) {
      let returned = 0;
      for (const vid of visitors) {
        const activity = visitorActivity.get(vid)!;
        for (const actKey of activity) {
          if (periodIndex(cohortKey, actKey, granularity) === p) {
            returned++;
            break;
          }
        }
      }
      const pct = total === 0 ? 0 : Math.round((returned / total) * 1000) / 10;
      periods.push(pct);
    }

    return { cohort: cohortKey, total, periods };
  });

  return { cohorts };
}
