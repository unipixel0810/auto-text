import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

/**
 * POST /api/ab/track
 * A/B 이벤트 기록: impression, click, conversion
 */
export async function POST(req: NextRequest) {
  try {
    const { experiment_name, variant, event_type, session_id } = await req.json();

    if (!experiment_name || !variant || !event_type || !session_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['A', 'B'].includes(variant)) {
      return NextResponse.json({ error: 'Invalid variant' }, { status: 400 });
    }

    if (!['impression', 'click', 'conversion'].includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      // Supabase 미설정 시 조용히 성공 반환 (개발 환경)
      return NextResponse.json({ ok: true, source: 'noop' });
    }

    const { error } = await supabase.from('ab_events').insert({
      experiment_name,
      variant,
      event_type,
      session_id,
    });

    if (error) {
      console.error('[AB/track] Supabase insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[AB/track] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
