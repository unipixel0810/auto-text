import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

/** POST: 설문 응답 저장 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { nps_score, nps_reason, sus_answers, open_best, open_worst, open_change, open_feature } = body;

    if (nps_score === undefined || !sus_answers || sus_answers.length !== 10) {
      return NextResponse.json({ error: 'nps_score and 10 sus_answers are required' }, { status: 400 });
    }

    // SUS 점수 계산
    const susScore = calculateSUS(sus_answers);

    const { error } = await supabase.from('survey_responses').insert({
      nps_score,
      nps_reason: nps_reason || null,
      sus_answers,
      sus_score: susScore,
      open_best: open_best || null,
      open_worst: open_worst || null,
      open_change: open_change || null,
      open_feature: open_feature || null,
      completed: true,
    });

    if (error) {
      console.error('[Survey] Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sus_score: susScore });
  } catch (err) {
    console.error('[Survey] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** GET: 설문 결과 조회 (관리자용) */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data, error } = await supabase
      .from('survey_responses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ responses: data || [] });
  } catch (err) {
    console.error('[Survey] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** SUS 점수 계산 (0~100) */
function calculateSUS(answers: number[]): number {
  let total = 0;
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) {
      // 홀수 문항 (1,3,5,7,9): 점수 - 1
      total += (answers[i] - 1);
    } else {
      // 짝수 문항 (2,4,6,8,10): 5 - 점수
      total += (5 - answers[i]);
    }
  }
  return total * 2.5;
}
