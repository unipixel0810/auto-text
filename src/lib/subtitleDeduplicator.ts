/**
 * SubtitleDeduplicator — 자막 텍스트/시간 기반 중복 제거
 *
 * 의존: types/subtitle. UI 의존 없음.
 */

import type { TranscriptItem } from '@/types/subtitle';

/** AI 자막 텍스트 기반 중복 제거 (유사 텍스트 + 5초 이내) */
export function deduplicateByText(items: TranscriptItem[]): TranscriptItem[] {
  if (items.length <= 1) return items;
  const sorted = [...items].sort((a, b) => a.startTime - b.startTime);
  const removed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (removed.has(i)) continue;
    const textI = (sorted[i].editedText || sorted[i].originalText).trim();
    for (let j = i + 1; j < sorted.length; j++) {
      if (removed.has(j)) continue;
      if (sorted[j].startTime - sorted[i].endTime > 5) break;
      const textJ = (sorted[j].editedText || sorted[j].originalText).trim();
      const same = textI === textJ || textI.includes(textJ) || textJ.includes(textI);
      if (same && Math.abs(sorted[i].startTime - sorted[j].startTime) < 3) {
        removed.add(textI.length >= textJ.length ? j : i);
        if (textI.length < textJ.length) break;
      }
    }
  }
  return sorted.filter((_, idx) => !removed.has(idx));
}

/** 대본 중복 제거 (동일 텍스트 + 근접 시간) */
export function deduplicateDialogue(items: TranscriptItem[]): TranscriptItem[] {
  if (items.length <= 1) return items;
  const sorted = [...items].sort((a, b) => a.startTime - b.startTime);
  const result: TranscriptItem[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const cur = sorted[i];
    const pT = (prev.editedText || prev.originalText).trim();
    const cT = (cur.editedText || cur.originalText).trim();
    if (pT === cT && Math.abs(cur.startTime - prev.startTime) < 1) continue;
    if (Math.abs(cur.startTime - prev.startTime) < 0.5 && Math.abs(cur.endTime - prev.endTime) < 0.5) {
      if (cT.length > pT.length) result[result.length - 1] = cur;
      continue;
    }
    result.push(cur);
  }
  return result;
}
