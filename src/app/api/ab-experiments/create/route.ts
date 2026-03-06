import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, pageUrl, elementSelector, variantA, variantB, elementType } = body;

    if (!name || !pageUrl || !elementSelector || !variantA || !variantB) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase configuration is missing. Please check .env.local' }, { status: 500 });
    }

    // Supabase에 실험 설정 저장
    const { data, error } = await supabase
      .from('ab_experiments')
      .insert({
        name,
        page_url: pageUrl,
        element_selector: elementSelector,
        variant_a: variantA,
        variant_b: variantB,
        element_type: elementType || 'button',
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      // 이미 존재하는 경우 업데이트
      if (error.code === '23505') {
        const { data: updated, error: updateError } = await supabase
          .from('ab_experiments')
          .update({
            page_url: pageUrl,
            element_selector: elementSelector,
            variant_a: variantA,
            variant_b: variantB,
            element_type: elementType || 'button',
            is_active: true,
          })
          .eq('name', name)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        return NextResponse.json({
          success: true,
          message: 'Experiment updated successfully',
          experiment: updated
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Experiment created successfully',
      experiment: data
    });
  } catch (error: any) {
    console.error('Failed to create experiment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
