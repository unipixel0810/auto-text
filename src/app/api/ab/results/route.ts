import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/analytics/supabase';

/**
 * 카이제곱 검정: 2×2 분할표
 * H0: variant와 전환율은 독립이다
 */
function chiSquared(
  aImp: number, aClick: number,
  bImp: number, bClick: number,
): number {
  const aNoClick = aImp - aClick;
  const bNoClick = bImp - bClick;
  const total = aImp + bImp;
  const totalClick = aClick + bClick;
  const totalNoClick = aNoClick + bNoClick;

  if (total === 0 || totalClick === 0 || totalNoClick === 0) return 1;

  const cells = [
    { observed: aClick, expected: (aImp * totalClick) / total },
    { observed: aNoClick, expected: (aImp * totalNoClick) / total },
    { observed: bClick, expected: (bImp * totalClick) / total },
    { observed: bNoClick, expected: (bImp * totalNoClick) / total },
  ];

  let chi2 = 0;
  for (const c of cells) {
    if (c.expected === 0) continue;
    chi2 += Math.pow(c.observed - c.expected, 2) / c.expected;
  }

  // df=1 카이제곱 → p-value 근사 (Abramowitz & Stegun)
  if (chi2 === 0) return 1;
  const z = Math.sqrt(chi2);
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, 2 * p); // 양측 검정
}

/**
 * GET /api/ab/results
 * 모든 실험의 A vs B 통계 + p-value 반환
 */
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      error: 'Supabase 설정이 필요합니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY를 추가하세요.',
    });
  }

  try {
    // 10초 타임아웃으로 감싸기
    const result = await Promise.race([
      fetchResults(supabase),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase 응답 시간 초과 (10초)')), 10_000),
      ),
    ]);

    return NextResponse.json({ experiments: result });
  } catch (err) {
    console.error('[AB/results] Error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ experiments: [], error: msg });
  }
}

/** Wilson score 95% 신뢰구간 */
function wilsonCI(successes: number, total: number): { lower: number; upper: number } {
  if (total === 0) return { lower: 0, upper: 0 };
  const z = 1.96; // 95%
  const p = successes / total;
  const denom = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denom;
  const margin = (z / denom) * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  return {
    lower: Math.round(Math.max(0, center - margin) * 10000) / 100, // %
    upper: Math.round(Math.min(1, center + margin) * 10000) / 100, // %
  };
}

/** 필요 표본 크기 (양측 검정, α=0.05, β=0.2) */
function requiredSampleSize(p1: number, p2: number): number {
  if (p1 === p2 || p1 <= 0 || p2 <= 0) return 0;
  const z_alpha = 1.96;
  const z_beta = 0.84;
  const pooled = (z_alpha + z_beta) ** 2;
  const n = pooled * (p1 * (1 - p1) + p2 * (1 - p2)) / ((p2 - p1) ** 2);
  return Math.ceil(n) * 2; // 양쪽 합계
}

async function fetchResults(supabase: ReturnType<typeof getSupabase>) {
  if (!supabase) return [];

  const { data: events, error } = await supabase
    .from('ab_events')
    .select('experiment_name, variant, event_type')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[AB/results] Query error:', error.message);
    throw new Error(error.message);
  }

  // 실험별 집계
  const map: Record<string, {
    A: { impressions: number; clicks: number; conversions: number };
    B: { impressions: number; clicks: number; conversions: number };
  }> = {};

  for (const e of events || []) {
    const v = e.variant as 'A' | 'B';
    if (v !== 'A' && v !== 'B') continue;

    if (!map[e.experiment_name]) {
      map[e.experiment_name] = {
        A: { impressions: 0, clicks: 0, conversions: 0 },
        B: { impressions: 0, clicks: 0, conversions: 0 },
      };
    }

    const bucket = map[e.experiment_name][v];
    if (e.event_type === 'impression') bucket.impressions++;
    else if (e.event_type === 'click') bucket.clicks++;
    else if (e.event_type === 'conversion') bucket.conversions++;
  }

  return Object.entries(map).map(([name, variants]) => {
    const { A, B } = variants;
    const ctrA = A.impressions > 0 ? (A.clicks / A.impressions) * 100 : 0;
    const ctrB = B.impressions > 0 ? (B.clicks / B.impressions) * 100 : 0;
    const pValue = chiSquared(A.impressions, A.clicks, B.impressions, B.clicks);
    const isSignificant = pValue < 0.05;

    let winner: 'A' | 'B' | 'Draw' = 'Draw';
    if (isSignificant) winner = ctrA > ctrB ? 'A' : 'B';

    // 95% 신뢰구간 계산 (Wilson score interval)
    const ciA = wilsonCI(A.clicks, A.impressions);
    const ciB = wilsonCI(B.clicks, B.impressions);

    // 결론까지 필요한 추가 표본 크기 계산
    const totalN = A.impressions + B.impressions;
    const requiredN = requiredSampleSize(ctrA / 100, ctrB / 100);
    const remainingN = Math.max(0, requiredN - totalN);

    return {
      name,
      variants: {
        A: { ...A, ctr: Math.round(ctrA * 100) / 100, ci: ciA },
        B: { ...B, ctr: Math.round(ctrB * 100) / 100, ci: ciB },
      },
      pValue: Math.round(pValue * 10000) / 10000,
      isSignificant,
      winner,
      remainingN,
    };
  });
}
