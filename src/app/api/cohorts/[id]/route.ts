import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

// DELETE /api/cohorts/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'No database' }, { status: 500 });
  }

  try {
    const { error } = await supabase
      .from('cohort_definitions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Cohorts] delete error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Cohorts] DELETE error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
