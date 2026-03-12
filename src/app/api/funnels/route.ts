import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export interface FunnelStep {
  name: string;
  label: string;
  order: number;
}

export interface FunnelDefinition {
  id: string;
  name: string;
  description: string;
  steps: FunnelStep[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** GET: 퍼널 목록 조회 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ funnels: data || [] });
}

/** POST: 퍼널 생성 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { name, description, steps } = body;

    if (!name || !steps || !Array.isArray(steps) || steps.length < 2) {
      return NextResponse.json(
        { error: '퍼널 이름과 최소 2개의 단계가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('funnels')
      .insert({
        name,
        description: description || '',
        steps,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ funnel: data });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
