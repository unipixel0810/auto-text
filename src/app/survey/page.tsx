'use client';

import React, { useState } from 'react';

/* ───────── 상수 ───────── */

const SUS_QUESTIONS = [
  '이 시스템을 자주 사용하고 싶다.',
  '이 시스템이 불필요하게 복잡하다고 느꼈다.',
  '이 시스템이 사용하기 쉽다고 생각한다.',
  '이 시스템을 사용하려면 전문가의 도움이 필요할 것 같다.',
  '이 시스템의 다양한 기능이 잘 통합되어 있다고 느꼈다.',
  '이 시스템에 일관성이 없는 부분이 너무 많다고 느꼈다.',
  '대부분의 사람들이 이 시스템 사용법을 빠르게 배울 수 있을 것이다.',
  '이 시스템이 사용하기에 매우 번거롭다고 느꼈다.',
  '이 시스템을 사용할 때 자신감이 있었다.',
  '이 시스템을 사용하기 전에 많은 것을 배워야 했다.',
];

const LIKERT_LABELS = ['전혀 아니다', '아니다', '보통이다', '그렇다', '매우 그렇다'];

const STEPS = ['nps', 'sus', 'open', 'done'] as const;
type Step = (typeof STEPS)[number];

/* ───────── 유틸 ───────── */

function calculateSUS(answers: number[]): number {
  let total = 0;
  for (let i = 0; i < 10; i++) {
    total += i % 2 === 0 ? answers[i] - 1 : 5 - answers[i];
  }
  return total * 2.5;
}

function getSUSGrade(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'A (우수)', color: '#22c55e' };
  if (score >= 68) return { label: 'B (양호)', color: '#84cc16' };
  if (score >= 51) return { label: 'C (보통)', color: '#eab308' };
  return { label: 'D (개선 필요)', color: '#ef4444' };
}

function npsColor(n: number): string {
  if (n <= 6) return 'bg-red-500/80 hover:bg-red-500 border-red-500/50';
  if (n <= 8) return 'bg-yellow-500/80 hover:bg-yellow-500 border-yellow-500/50';
  return 'bg-green-500/80 hover:bg-green-500 border-green-500/50';
}

function npsSelectedColor(n: number): string {
  if (n <= 6) return 'bg-red-500 ring-2 ring-red-300 border-red-400';
  if (n <= 8) return 'bg-yellow-500 ring-2 ring-yellow-300 border-yellow-400';
  return 'bg-green-500 ring-2 ring-green-300 border-green-400';
}

/* ───────── 컴포넌트 ───────── */

export default function SurveyPage() {
  const [step, setStep] = useState<Step>('nps');
  const [submitting, setSubmitting] = useState(false);

  // NPS
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [npsReason, setNpsReason] = useState('');

  // SUS
  const [susAnswers, setSusAnswers] = useState<number[]>(Array(10).fill(0));

  // Open
  const [openBest, setOpenBest] = useState('');
  const [openWorst, setOpenWorst] = useState('');
  const [openChange, setOpenChange] = useState('');
  const [openFeature, setOpenFeature] = useState('');

  // SUS 계산 결과
  const [susResult, setSusResult] = useState<number | null>(null);

  const currentIdx = STEPS.indexOf(step);
  const progressPct = step === 'done' ? 100 : ((currentIdx) / (STEPS.length - 1)) * 100;

  const canProceedSUS = susAnswers.every(a => a >= 1 && a <= 5);

  const handleSusAnswer = (qIdx: number, value: number) => {
    setSusAnswers(prev => {
      const next = [...prev];
      next[qIdx] = value;
      return next;
    });
  };

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goPrev = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const handleSubmit = async () => {
    if (npsScore === null || !canProceedSUS) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nps_score: npsScore,
          nps_reason: npsReason.trim() || null,
          sus_answers: susAnswers,
          open_best: openBest.trim() || null,
          open_worst: openWorst.trim() || null,
          open_change: openChange.trim() || null,
          open_feature: openFeature.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.sus_score !== undefined) setSusResult(data.sus_score);
      else setSusResult(calculateSUS(susAnswers));
      setStep('done');
    } catch {
      setSusResult(calculateSUS(susAnswers));
      setStep('done');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] flex flex-col items-center px-4 py-8">
      {/* 헤더 */}
      <div className="w-full max-w-2xl mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">AutoText 베타 테스트 설문조사</h1>
        <p className="text-sm text-gray-500">소중한 의견을 들려주세요. 서비스 개선에 큰 도움이 됩니다.</p>
      </div>

      {/* 프로그레스 바 */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex justify-between text-[11px] text-gray-500 mb-2">
          {['NPS', 'SUS', '오픈 질문', '완료'].map((label, i) => (
            <span key={label} className={i <= currentIdx ? 'text-[#00D4D4] font-semibold' : ''}>{label}</span>
          ))}
        </div>
        <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00D4D4] to-[#0099CC] rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 카드 */}
      <div className="w-full max-w-2xl bg-[#12121a] border border-[#2a2a3e] rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 sm:p-8">

          {/* ───── 섹션 1: NPS ───── */}
          {step === 'nps' && (
            <div className="space-y-6">
              <div>
                <span className="text-[11px] font-semibold text-[#00D4D4] uppercase tracking-wider">섹션 1/3 — NPS</span>
                <h2 className="text-lg font-bold text-white mt-2">이 서비스를 친구/동료에게 추천하시겠습니까?</h2>
                <p className="text-[13px] text-gray-500 mt-1">0 (전혀 아님) ~ 10 (매우 추천)</p>
              </div>

              {/* NPS 숫자 버튼 */}
              <div className="flex flex-wrap gap-2 justify-center">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setNpsScore(i)}
                    className={`w-12 h-12 rounded-xl border text-white font-bold text-sm transition-all duration-200 ${
                      npsScore === i
                        ? npsSelectedColor(i) + ' scale-110'
                        : npsColor(i) + ' opacity-70'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>

              {/* NPS 범례 */}
              <div className="flex justify-between text-[10px] px-1">
                <span className="text-red-400">비추천자 (0-6)</span>
                <span className="text-yellow-400">중립 (7-8)</span>
                <span className="text-green-400">추천자 (9-10)</span>
              </div>

              {/* NPS 이유 */}
              {npsScore !== null && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <label className="text-[13px] text-gray-400">그 점수를 준 이유는?</label>
                  <textarea
                    value={npsReason}
                    onChange={e => setNpsReason(e.target.value)}
                    placeholder="자유롭게 적어주세요..."
                    rows={3}
                    className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50 resize-none"
                  />
                </div>
              )}

              {/* 다음 */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={goNext}
                  disabled={npsScore === null}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#00D4D4] to-[#0099CC] text-white text-sm font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            </div>
          )}

          {/* ───── 섹션 2: SUS ───── */}
          {step === 'sus' && (
            <div className="space-y-6">
              <div>
                <span className="text-[11px] font-semibold text-[#00D4D4] uppercase tracking-wider">섹션 2/3 — 사용성 평가 (SUS)</span>
                <h2 className="text-lg font-bold text-white mt-2">시스템 사용성 평가</h2>
                <p className="text-[13px] text-gray-500 mt-1">각 문항에 대해 동의하는 정도를 선택해주세요.</p>
              </div>

              <div className="space-y-4">
                {SUS_QUESTIONS.map((q, qIdx) => (
                  <div key={qIdx} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
                    <p className="text-[13px] text-gray-300 mb-3">
                      <span className="text-[#00D4D4] font-semibold mr-2">{qIdx + 1}.</span>
                      {q}
                    </p>
                    <div className="flex items-center gap-1 sm:gap-2">
                      {LIKERT_LABELS.map((label, lIdx) => {
                        const value = lIdx + 1;
                        const isSelected = susAnswers[qIdx] === value;
                        return (
                          <button
                            key={lIdx}
                            onClick={() => handleSusAnswer(qIdx, value)}
                            className={`flex-1 py-2 rounded-lg text-[10px] sm:text-[11px] font-medium transition-all duration-200 border ${
                              isSelected
                                ? 'bg-[#00D4D4]/20 border-[#00D4D4] text-[#00D4D4]'
                                : 'bg-[#12121a] border-[#2a2a3e] text-gray-500 hover:border-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 네비게이션 */}
              <div className="flex justify-between pt-2">
                <button
                  onClick={goPrev}
                  className="px-6 py-2.5 border border-[#2a2a3e] text-gray-400 text-sm font-semibold rounded-xl hover:bg-white/5 transition-all"
                >
                  이전
                </button>
                <button
                  onClick={goNext}
                  disabled={!canProceedSUS}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#00D4D4] to-[#0099CC] text-white text-sm font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>

              {!canProceedSUS && (
                <p className="text-[11px] text-yellow-500/70 text-center">
                  모든 문항에 응답해주세요 ({susAnswers.filter(a => a >= 1).length}/10 완료)
                </p>
              )}
            </div>
          )}

          {/* ───── 섹션 3: 오픈 질문 ───── */}
          {step === 'open' && (
            <div className="space-y-6">
              <div>
                <span className="text-[11px] font-semibold text-[#00D4D4] uppercase tracking-wider">섹션 3/3 — 자유 의견</span>
                <h2 className="text-lg font-bold text-white mt-2">솔직한 의견을 들려주세요</h2>
                <p className="text-[13px] text-gray-500 mt-1">모든 항목은 선택사항입니다.</p>
              </div>

              {[
                { label: '가장 좋았던 기능은 무엇인가요?', value: openBest, setter: setOpenBest, placeholder: '예: AI 자막 자동 생성이 정말 편리했어요' },
                { label: '가장 불편했던 점은 무엇인가요?', value: openWorst, setter: setOpenWorst, placeholder: '예: 타임라인 조작이 좀 어려웠어요' },
                { label: '한 가지 바꿀 수 있다면 무엇을 바꾸시겠어요?', value: openChange, setter: setOpenChange, placeholder: '예: 단축키를 더 다양하게 지원해주세요' },
                { label: '추가됐으면 하는 기능이 있나요?', value: openFeature, setter: setOpenFeature, placeholder: '예: 자막 번역 기능이 있으면 좋겠어요' },
              ].map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <label className="text-[13px] text-gray-300 font-medium">{item.label}</label>
                  <textarea
                    value={item.value}
                    onChange={e => item.setter(e.target.value)}
                    placeholder={item.placeholder}
                    rows={2}
                    className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50 resize-none"
                  />
                </div>
              ))}

              {/* 네비게이션 */}
              <div className="flex justify-between pt-2">
                <button
                  onClick={goPrev}
                  className="px-6 py-2.5 border border-[#2a2a3e] text-gray-400 text-sm font-semibold rounded-xl hover:bg-white/5 transition-all"
                >
                  이전
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-8 py-2.5 bg-gradient-to-r from-[#00D4D4] to-[#0099CC] text-white text-sm font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {submitting ? '제출 중...' : '설문 제출하기'}
                </button>
              </div>
            </div>
          )}

          {/* ───── 완료 ───── */}
          {step === 'done' && (
            <div className="flex flex-col items-center py-8 gap-6">
              {/* 체크 애니메이션 */}
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 96 96" className="w-full h-full">
                  <circle
                    cx="48" cy="48" r="44"
                    fill="none"
                    stroke="#00D4D4"
                    strokeWidth="3"
                    strokeDasharray="276.46"
                    strokeDashoffset="0"
                    className="animate-[drawCircle_0.6s_ease-out_forwards]"
                  />
                  <path
                    d="M28 50 L42 64 L68 34"
                    fill="none"
                    stroke="#00D4D4"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="80"
                    strokeDashoffset="0"
                    className="animate-[drawCheck_0.4s_ease-out_0.5s_forwards]"
                    style={{ strokeDashoffset: 0 }}
                  />
                </svg>
              </div>

              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-white">감사합니다!</h2>
                <p className="text-sm text-gray-400">설문이 성공적으로 제출되었습니다.</p>
              </div>

              {/* SUS 결과 표시 */}
              {susResult !== null && (
                <div className="w-full max-w-xs bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-5 text-center space-y-2">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">사용성 점수 (SUS)</p>
                  <p className="text-4xl font-bold" style={{ color: getSUSGrade(susResult).color }}>
                    {susResult.toFixed(1)}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: getSUSGrade(susResult).color }}>
                    등급: {getSUSGrade(susResult).label}
                  </p>
                  <div className="h-2 bg-[#1e1e2e] rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${susResult}%`,
                        backgroundColor: getSUSGrade(susResult).color,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">평균 SUS 점수: 68점</p>
                </div>
              )}

              <a
                href="/"
                className="mt-4 px-6 py-2.5 border border-[#2a2a3e] text-gray-400 text-sm rounded-xl hover:bg-white/5 transition-all"
              >
                서비스로 돌아가기
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 푸터 */}
      <p className="text-[11px] text-gray-600 mt-8">AutoText 베타 테스트 설문 | 응답은 익명으로 처리됩니다</p>

      {/* 애니메이션 CSS */}
      <style jsx global>{`
        @keyframes drawCircle {
          from { stroke-dashoffset: 276.46; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes drawCheck {
          from { stroke-dashoffset: 80; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
