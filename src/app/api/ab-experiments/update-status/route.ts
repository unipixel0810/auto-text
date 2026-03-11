import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, status } = body as { name: string; status: 'running' | 'paused' | 'completed' };

    if (!name || !status || !['running', 'paused', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'name과 status(running|paused|completed)가 필요합니다.' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });
    }

    const { error } = await supabase
      .from('ab_experiments')
      .update({
        status,
        is_active: status === 'running',
      })
      .eq('name', name);

    if (error) throw error;

    return NextResponse.json({ success: true, name, status });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[update-status] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
