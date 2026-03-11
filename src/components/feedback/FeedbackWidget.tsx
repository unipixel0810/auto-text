'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

const EMOTIONS = [
  { value: 1, emoji: '😡', label: '매우 불만' },
  { value: 2, emoji: '😞', label: '불만' },
  { value: 3, emoji: '😐', label: '보통' },
  { value: 4, emoji: '😊', label: '만족' },
  { value: 5, emoji: '🤩', label: '매우 만족' },
];

const CATEGORIES = [
  { id: 'ui', label: 'UI/디자인', icon: 'palette' },
  { id: 'feature', label: '기능', icon: 'build' },
  { id: 'speed', label: '속도', icon: 'speed' },
  { id: 'content', label: '콘텐츠', icon: 'article' },
  { id: 'other', label: '기타', icon: 'more_horiz' },
];

type Step = 'emotion' | 'category' | 'message' | 'done';

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('emotion');
  const [emotion, setEmotion] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setStep('emotion');
    setEmotion(null);
    setCategory(null);
    setMessage('');
    setScreenshot(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 300);
  }, [reset]);

  // done 단계 2초 후 자동 닫기
  useEffect(() => {
    if (step === 'done') {
      const timer = setTimeout(handleClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [step, handleClose]);

  const captureScreenshot = async () => {
    setScreenshotLoading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        scale: 0.5,
        logging: false,
        useCORS: true,
        ignoreElements: (el) => el.closest('[data-feedback-widget]') !== null,
      });
      setScreenshot(canvas.toDataURL('image/jpeg', 0.6));
    } catch {
      // html2canvas 실패 시 무시
    }
    setScreenshotLoading(false);
  };

  const handleSubmit = async () => {
    if (!emotion || !category) return;
    setSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emotion,
          category,
          message: message.trim() || null,
          page_url: window.location.pathname,
          screenshot: screenshot || null,
          session_id: getSessionId(),
        }),
      });
      setStep('done');
    } catch {
      // 에러 무시
    }
    setSubmitting(false);
  };

  return (
    <div data-feedback-widget className="fixed bottom-6 right-6 z-[9999]">
      {/* 플로팅 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group w-14 h-14 rounded-full bg-gradient-to-br from-[#00D4D4] to-[#0099CC] shadow-lg shadow-cyan-500/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
        >
          <span className="material-symbols-outlined text-white text-[26px]">rate_review</span>
          <span className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-[11px] text-white bg-[#1a1a24] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-xl border border-white/10">
            피드백 보내기
          </span>
        </button>
      )}

      {/* 피드백 폼 */}
      {open && (
        <div
          ref={formRef}
          className="w-[340px] bg-[#12121a] border border-[#2a2a3e] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00D4D4] text-[18px]">feedback</span>
              <span className="text-sm font-semibold text-white">
                {step === 'done' ? '감사합니다!' : '피드백'}
              </span>
            </div>
            <button onClick={handleClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
            </button>
          </div>

          <div className="p-4">
            {/* Step 1: 감정 선택 */}
            {step === 'emotion' && (
              <div className="space-y-3">
                <p className="text-[13px] text-gray-400">서비스 경험은 어떠셨나요?</p>
                <div className="flex justify-between px-2">
                  {EMOTIONS.map(e => (
                    <button
                      key={e.value}
                      onClick={() => { setEmotion(e.value); setStep('category'); }}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/10 transition-all hover:scale-110 active:scale-95"
                    >
                      <span className="text-[32px]">{e.emoji}</span>
                      <span className="text-[10px] text-gray-500">{e.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: 카테고리 선택 */}
            {step === 'category' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setStep('emotion')} className="p-0.5 hover:bg-white/10 rounded transition-colors">
                    <span className="material-symbols-outlined text-gray-500 text-[16px]">arrow_back</span>
                  </button>
                  <p className="text-[13px] text-gray-400">어떤 부분에 대한 피드백인가요?</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setCategory(c.id); setStep('message'); }}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-[#2a2a3e] hover:border-[#00D4D4]/50 hover:bg-[#00D4D4]/5 transition-all"
                    >
                      <span className="material-symbols-outlined text-[20px] text-gray-400">{c.icon}</span>
                      <span className="text-[11px] text-gray-400">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: 메시지 입력 */}
            {step === 'message' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setStep('category')} className="p-0.5 hover:bg-white/10 rounded transition-colors">
                    <span className="material-symbols-outlined text-gray-500 text-[16px]">arrow_back</span>
                  </button>
                  <p className="text-[13px] text-gray-400">자세한 내용을 알려주세요 (선택)</p>
                </div>

                {/* 선택된 감정 + 카테고리 표시 */}
                <div className="flex items-center gap-2 text-[12px] text-gray-500">
                  <span className="text-[18px]">{EMOTIONS.find(e => e.value === emotion)?.emoji}</span>
                  <span className="px-2 py-0.5 bg-[#1e1e2e] rounded-md">{CATEGORIES.find(c => c.id === category)?.label}</span>
                </div>

                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="무엇이든 자유롭게 적어주세요..."
                  rows={3}
                  className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50 resize-none"
                />

                {/* 스크린샷 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={captureScreenshot}
                    disabled={screenshotLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-gray-400 bg-[#1e1e2e] hover:bg-[#2a2a3e] rounded-lg transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {screenshotLoading ? 'hourglass_empty' : screenshot ? 'check_circle' : 'screenshot_monitor'}
                    </span>
                    {screenshot ? '스크린샷 첨부됨' : '스크린샷 첨부'}
                  </button>
                  {screenshot && (
                    <button onClick={() => setScreenshot(null)} className="text-[11px] text-gray-600 hover:text-red-400 transition-colors">
                      제거
                    </button>
                  )}
                </div>

                {/* 제출 */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-2.5 bg-gradient-to-r from-[#00D4D4] to-[#0099CC] text-white text-sm font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {submitting ? '보내는 중...' : '피드백 보내기'}
                </button>
              </div>
            )}

            {/* Done */}
            {step === 'done' && (
              <div className="flex flex-col items-center py-6 gap-3">
                <span className="text-[48px] animate-bounce">🙏</span>
                <p className="text-sm text-white font-semibold">감사합니다!</p>
                <p className="text-[12px] text-gray-500">소중한 피드백 반영하겠습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 세션 ID (탭 단위 유지) */
function getSessionId(): string {
  const KEY = 'feedback_session_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
