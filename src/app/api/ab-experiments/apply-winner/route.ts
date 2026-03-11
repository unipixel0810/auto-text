import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, winner } = body as { name: string; winner: 'A' | 'B' };

    if (!name || !winner || !['A', 'B'].includes(winner)) {
      return NextResponse.json({ error: 'name과 winner(A|B)가 필요합니다.' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });
    }

    // 현재 실험 조회
    const { data: exp, error: fetchError } = await supabase
      .from('ab_experiments')
      .select('variant_a, variant_b')
      .eq('name', name)
      .single();

    if (fetchError || !exp) {
      return NextResponse.json({ error: '실험을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 승자 variant 텍스트 결정
    const winnerText = winner === 'A' ? exp.variant_a : exp.variant_b;

    // variant_a를 승자로 교체 + 실험 종료 처리
    const { error: updateError } = await supabase
      .from('ab_experiments')
      .update({
        variant_a: winnerText,
        is_active: false,
        status: 'completed',
      })
      .eq('name', name);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: `변형 ${winner} ("${winnerText}")이 승자로 적용되었습니다.`,
      winner,
      appliedText: winnerText,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[apply-winner] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
