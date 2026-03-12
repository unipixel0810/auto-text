import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

// GET /api/cohorts/[id]/members
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json([]);
  }

  try {
    // 1. 코호트 정의 조회
    const { data: cohort, error: cohortError } = await supabase
      .from('cohort_definitions')
      .select('rules')
      .eq('id', id)
      .single();

    if (cohortError || !cohort) {
      return NextResponse.json([]);
    }

    const rules = cohort.rules || [];
    if (rules.length === 0) return NextResponse.json([]);

    // 2. 규칙 평가 → 매칭 세션 찾기
    const matchingSets: Map<string, { count: number; lastSeen: string }>[] = [];

    for (const rule of rules) {
      const cutoff = new Date(Date.now() - (rule.timeWindow || 30) * 86400000).toISOString();

      const { data, error } = await supabase
        .from('analytics_events')
        .select('session_id, created_at')
        .eq('event_type', rule.eventType)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error || !data) {
        matchingSets.push(new Map());
        continue;
      }

      const sessionMap = new Map<string, { count: number; lastSeen: string }>();
      for (const row of data) {
        const existing = sessionMap.get(row.session_id);
        if (existing) {
          existing.count++;
        } else {
          sessionMap.set(row.session_id, { count: 1, lastSeen: row.created_at });
        }
      }

      // operator 필터
      const filtered = new Map<string, { count: number; lastSeen: string }>();
      const op = rule.operator || '>=';
      const val = rule.value ?? 1;
      for (const [sid, info] of sessionMap) {
        if (
          (op === '>=' && info.count >= val) ||
          (op === '<=' && info.count <= val) ||
          (op === '==' && info.count === val)
        ) {
          filtered.set(sid, info);
        }
      }
      matchingSets.push(filtered);
    }

    if (matchingSets.length === 0) return NextResponse.json([]);

    // 교집합
    let resultIds = new Set(matchingSets[0].keys());
    for (let i = 1; i < matchingSets.length; i++) {
      resultIds = new Set([...resultIds].filter(id => matchingSets[i].has(id)));
    }

    // 멤버 목록 생성
    const members = [...resultIds].slice(0, 100).map(sid => {
      // 첫 번째 규칙의 데이터에서 정보 가져오기
      const info = matchingSets[0].get(sid);
      return {
        userId: sid,
        eventCount: info?.count ?? 0,
        lastSeen: info?.lastSeen ?? new Date().toISOString(),
      };
    });

    return NextResponse.json(members);
  } catch (err) {
    console.error('[Cohorts] members error:', err);
    return NextResponse.json([]);
  }
}
