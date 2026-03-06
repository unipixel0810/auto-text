import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';
import type { SessionRecord } from '@/lib/analytics/recorder';

export async function POST(request: NextRequest) {
  try {
    const body: SessionRecord = await request.json();
    
    if (!body.session_id || !body.page_url || !body.events) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase client not initialized' },
        { status: 500 }
      );
    }

    // 세션 기록 저장
    const { error } = await supabase
      .from('session_records')
      .insert({
        session_id: body.session_id,
        page_url: body.page_url,
        events: body.events,
        start_time: new Date(body.start_time).toISOString(),
        end_time: new Date(body.end_time).toISOString(),
      });

    if (error) {
      console.error('[API] Failed to save session record:', error);
      return NextResponse.json(
        { error: 'Failed to save session record' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error in /api/analytics/record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
