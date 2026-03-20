/**
 * STT 교정 사전 서비스
 * 음성인식 오류 → 사용자 수정 쌍을 Supabase에 축적하고,
 * 새로운 STT 결과에 자동 교정을 적용합니다.
 */

import { getSupabase } from '@/lib/analytics/supabase';

export interface SttCorrection {
  id?: string;
  original: string;
  corrected: string;
  context?: string;       // 앞뒤 문맥 (선택)
  frequency: number;      // 동일 교정 발생 횟수
  created_at?: string;
  updated_at?: string;
}

/** 교정 쌍 저장 (같은 original→corrected면 frequency 증가) */
export async function saveSttCorrection(
  original: string,
  corrected: string,
  context?: string,
): Promise<void> {
  if (!original || !corrected || original === corrected) return;

  // 공백/특수문자만 다른 경우 무시
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  if (norm(original) === norm(corrected)) return;

  const supabase = getSupabase();
  if (!supabase) {
    // Supabase 없으면 localStorage 폴백
    saveToLocal(original, corrected, context);
    return;
  }

  // 기존 레코드 확인
  const { data: existing } = await supabase
    .from('stt_corrections')
    .select('id, frequency')
    .eq('original', original)
    .eq('corrected', corrected)
    .maybeSingle();

  if (existing) {
    // frequency 증가
    await supabase
      .from('stt_corrections')
      .update({ frequency: existing.frequency + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    // 새 레코드 삽입
    await supabase
      .from('stt_corrections')
      .insert({
        original,
        corrected,
        context: context || null,
        frequency: 1,
      });
  }
}

/** 교정 사전 전체 불러오기 (frequency 높은 순) */
export async function loadSttDictionary(): Promise<SttCorrection[]> {
  const supabase = getSupabase();
  if (!supabase) return loadFromLocal();

  const { data, error } = await supabase
    .from('stt_corrections')
    .select('*')
    .order('frequency', { ascending: false })
    .limit(1000);

  if (error || !data) {
    // 테이블 미존재(404) 등은 조용히 localStorage 폴백
    if (error?.code !== 'PGRST116') {
      console.debug('[STT Corrections] Supabase 폴백 → localStorage:', error?.message);
    }
    return loadFromLocal();
  }
  return data;
}

/** STT 텍스트에 교정 사전 자동 적용 */
export function applySttCorrections(text: string, dictionary: SttCorrection[]): string {
  if (!text || dictionary.length === 0) return text;

  let result = text;
  // frequency 높은 순으로 이미 정렬되어 있음
  // 긴 원본부터 적용 (짧은 단어가 긴 단어의 일부를 잘못 치환하는 것 방지)
  const sorted = [...dictionary].sort((a, b) => b.original.length - a.original.length);

  for (const entry of sorted) {
    if (entry.frequency < 2) continue; // 2회 이상 교정된 것만 자동 적용
    if (result.includes(entry.original)) {
      result = result.replaceAll(entry.original, entry.corrected);
    }
  }
  return result;
}

/** 여러 텍스트에 일괄 교정 적용 */
export function applySttCorrectionsToAll(
  texts: string[],
  dictionary: SttCorrection[],
): string[] {
  if (dictionary.length === 0) return texts;
  return texts.map(t => applySttCorrections(t, dictionary));
}

// ─── localStorage 폴백 ───

const LOCAL_KEY = 'stt_corrections';

function saveToLocal(original: string, corrected: string, context?: string): void {
  try {
    const stored: SttCorrection[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    const existing = stored.find(s => s.original === original && s.corrected === corrected);
    if (existing) {
      existing.frequency += 1;
      existing.updated_at = new Date().toISOString();
    } else {
      stored.push({
        original,
        corrected,
        context,
        frequency: 1,
        created_at: new Date().toISOString(),
      });
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stored));
  } catch { /* quota exceeded 등 무시 */ }
}

function loadFromLocal(): SttCorrection[] {
  try {
    const stored: SttCorrection[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return stored.sort((a, b) => b.frequency - a.frequency);
  } catch {
    return [];
  }
}
