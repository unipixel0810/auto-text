import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { experiment_name, variant, event_type, session_id } = body;

    if (!experiment_name || !variant || !event_type || !session_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: true, source: 'memory' });
    }

    const { error } = await supabase.from('ab_events').insert({
      experiment_name,
      variant,
      event_type,
      session_id,
    });

    if (error) {
      console.error('[AB-Track] Supabase error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[AB-Track] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
