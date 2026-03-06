import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const name = searchParams.get('name');

  if (!name) {
    return NextResponse.json({ error: 'Experiment name required' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase configuration is missing. Please check .env.local' }, { status: 500 });
  }

  try {
    // is_active를 false로 설정 (소프트 삭제)
    const { error } = await supabase
      .from('ab_experiments')
      .update({ is_active: false })
      .eq('name', name);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete experiment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
