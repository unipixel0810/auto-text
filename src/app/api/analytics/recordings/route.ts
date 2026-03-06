import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7', 10);

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase client not initialized' },
        { status: 500 }
      );
    }

    const cutoff = days > 0
      ? new Date(Date.now() - days * 86400000).toISOString()
      : days === 0
        ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        : undefined;

    let query = supabase
      .from('session_records')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (cutoff) {
      query = query.gte('created_at', cutoff);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[API] Failed to fetch recordings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch recordings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ recordings: data || [] });
  } catch (error) {
    console.error('[API] Error in /api/analytics/recordings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
