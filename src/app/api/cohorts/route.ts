import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

// GET /api/cohorts — 코호트 목록 조회
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const { data, error } = await supabase
      .from('cohort_definitions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // 테이블이 없으면 빈 배열 반환
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json([]);
      }
      console.error('[Cohorts] list error:', error.message);
      return NextResponse.json([], { status: 200 });
    }

    const cohorts = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      rules: row.rules || [],
      memberCount: row.member_count ?? 0,
      createdAt: row.created_at,
    }));

    return NextResponse.json(cohorts);
  } catch (err) {
    console.error('[Cohorts] unexpected error:', err);
    return NextResponse.json([]);
  }
}

// POST /api/cohorts — 코호트 생성
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'No database' }, { status: 500 });
  }

  try {
    const { name, rules } = await req.json();

    if (!name || !rules || !Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json({ error: 'name and rules required' }, { status: 400 });
    }

    // Validate each rule has the required structure before evaluation
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') {
        return NextResponse.json({ error: 'Each rule must be a non-null object' }, { status: 400 });
      }
      if (!rule.eventType || typeof rule.eventType !== 'string') {
        return NextResponse.json({ error: 'Each rule must have a non-empty eventType string' }, { status: 400 });
      }
    }

    // 코호트 규칙에 따른 멤버 수 계산
    const memberCount = await evaluateCohortRules(supabase, rules);

    const { data, error } = await supabase
      .from('cohort_definitions')
      .insert({ name, rules, member_count: memberCount })
      .select('*')
      .single();

    if (error) {
      console.error('[Cohorts] create error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      rules: data.rules,
      memberCount: data.member_count ?? 0,
      createdAt: data.created_at,
    });
  } catch (err) {
    console.error('[Cohorts] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function evaluateCohortRules(supabase: any, rules: any[]): Promise<number> {
  try {
    // 각 규칙별 매칭 세션(visitor) 집합을 구하고 교집합
    const matchingSets: Set<string>[] = [];

    for (const rule of rules) {
      if (!rule || !rule.eventType) {
        matchingSets.push(new Set());
        continue;
      }

      const cutoff = new Date(Date.now() - (rule.timeWindow || 30) * 86400000).toISOString();

      const { data, error } = await supabase
        .from('analytics_events')
        .select('session_id')
        .eq('event_type', rule.eventType)
        .gte('created_at', cutoff)
        .limit(10000);

      if (error || !data) {
        matchingSets.push(new Set());
        continue;
      }

      // 세션별 이벤트 수 계산
      const counts = new Map<string, number>();
      for (const row of data) {
        counts.set(row.session_id, (counts.get(row.session_id) || 0) + 1);
      }

      // operator 적용
      const matching = new Set<string>();
      for (const [sessionId, count] of counts) {
        const op = rule.operator || '>=';
        const val = rule.value ?? 1;
        if (
          (op === '>=' && count >= val) ||
          (op === '<=' && count <= val) ||
          (op === '==' && count === val)
        ) {
          matching.add(sessionId);
        }
      }
      matchingSets.push(matching);
    }

    if (matchingSets.length === 0) return 0;

    // 교집합
    let result = matchingSets[0];
    for (let i = 1; i < matchingSets.length; i++) {
      result = new Set([...result].filter(id => matchingSets[i].has(id)));
    }

    return result.size;
  } catch {
    return 0;
  }
}
