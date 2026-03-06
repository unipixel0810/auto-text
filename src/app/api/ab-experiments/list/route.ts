import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export async function GET() {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[API] Supabase configuration is missing.');
      return NextResponse.json({ experiments: [], error: 'Supabase configuration is missing. Please check .env.local' });
    }

    // 실험 목록 가져오기 (is_active 필터 제거하여 모든 실험 확인 - 테스트용)
    const { data: rawExperiments, error } = await supabase
      .from('ab_experiments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Failed to fetch experiments:', error);
      throw error;
    }

    console.log(`[API] Found ${rawExperiments?.length || 0} experiments in DB`);

    // 형식 변환
    const experiments = (rawExperiments || []).map((exp: any) => ({
      name: exp.name,
      pageUrl: exp.page_url,
      elementSelector: exp.element_selector,
      variantA: exp.variant_a,
      variantB: exp.variant_b,
      elementType: exp.element_type || 'text',
      isActive: exp.is_active,
    }));

    return NextResponse.json({ experiments });
  } catch (error: any) {
    console.error('Failed to fetch experiments:', error);
    return NextResponse.json({ experiments: [], error: error.message });
  }
}
