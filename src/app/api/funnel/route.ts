import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

/** POST: 퍼널 이벤트 기록 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { step_name, session_id } = body;

    if (!step_name || !session_id) {
      return NextResponse.json({ error: 'step_name and session_id are required' }, { status: 400 });
    }

    const { error } = await supabase.from('funnel_events').insert({
      step_name,
      session_id,
    });

    if (error) {
      console.error('[Funnel] Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Funnel] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** GET: 퍼널 데이터 조회 (관리자용) */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '30', 10);

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('funnel_events')
      .select('step_name, session_id, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data || [] });
  } catch (err) {
    console.error('[Funnel] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
