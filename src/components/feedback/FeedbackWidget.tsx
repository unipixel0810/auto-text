'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

const EMOTIONS = [
  { value: 1, emoji: '\ud83d\ude21', label: '\ub9e4\uc6b0 \ubd88\ub9cc' },
  { value: 2, emoji: '\ud83d\ude1e', label: '\ubd88\ub9cc' },
  { value: 3, emoji: '\ud83d\ude10', label: '\ubcf4\ud1b5' },
  { value: 4, emoji: '\ud83d\ude0a', label: '\ub9cc\uc871' },
  { value: 5, emoji: '\ud83e\udd29', label: '\ub9e4\uc6b0 \ub9cc\uc871' },
];

const CATEGORIES = [
  { id: 'ui', label: 'UI/\ub514\uc790\uc778', icon: 'palette' },
  { id: 'feature', label: '\uae30\ub2a5', icon: 'build' },
  { id: 'speed', label: '\uc18d\ub3c4', icon: 'speed' },
  { id: 'content', label: '\ucf58\ud150\uce20', icon: 'article' },
  { id: 'other', label: '\uae30\ud0c0', icon: 'more_horiz' },
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

  // done \ub2e8\uacc4 2\ucd08 \ud6c4 \uc790\ub3d9 \ub2eb\uae30
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
      // html2canvas \uc2e4\ud328 \uc2dc \ubb34\uc2dc
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
      // \uc5d0\ub7ec \ubb34\uc2dc
    }
    setSubmitting(false);
  };

  return (
    <div data-feedback-widget className="fixed bottom-6 right-6 z-[9999]">
      {/* \ud50c\ub85c\ud305 \ubc84\ud2bc */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group w-14 h-14 rounded-full bg-gradient-to-br from-[#00D4D4] to-[#0099CC] shadow-lg shadow-cyan-500/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
        >
          <span className="material-symbols-outlined text-white text-[26px]">rate_review</span>
          <span className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-[11px] text-white bg-[#1a1a24] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-xl border border-white/10">
            \ud53c\ub4dc\ubc31 \ubcf4\ub0b4\uae30
          </span>
        </button>
      )}

      {/* \ud53c\ub4dc\ubc31 \ud3fc */}
      {open && (
        <div
          ref={formRef}
          className="w-[340px] bg-[#12121a] border border-[#2a2a3e] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          {/* \ud5e4\ub354 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00D4D4] text-[18px]">feedback</span>
              <span className="text-sm font-semibold text-white">
                {step === 'done' ? '\uac10\uc0ac\ud569\ub2c8\ub2e4!' : '\ud53c\ub4dc\ubc31'}
              </span>
            </div>
            <button onClick={handleClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
            </button>
          </div>

          <div className="p-4">
            {/* Step 1: \uac10\uc815 \uc120\ud0dd */}
            {step === 'emotion' && (
              <div className="space-y-3">
                <p className="text-[13px] text-gray-400">\uc11c\ube44\uc2a4 \uacbd\ud5d8\uc740 \uc5b4\ub5a0\uc168\ub098\uc694?</p>
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

            {/* Step 2: \uce74\ud14c\uace0\ub9ac \uc120\ud0dd */}
            {step === 'category' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setStep('emotion')} className="p-0.5 hover:bg-white/10 rounded transition-colors">
                    <span className="material-symbols-outlined text-gray-500 text-[16px]">arrow_back</span>
                  </button>
                  <p className="text-[13px] text-gray-400">\uc5b4\ub5a4 \ubd80\ubd84\uc5d0 \ub300\ud55c \ud53c\ub4dc\ubc31\uc778\uac00\uc694?</p>
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

            {/* Step 3: \uba54\uc2dc\uc9c0 \uc785\ub825 */}
            {step === 'message' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setStep('category')} className="p-0.5 hover:bg-white/10 rounded transition-colors">
                    <span className="material-symbols-outlined text-gray-500 text-[16px]">arrow_back</span>
                  </button>
                  <p className="text-[13px] text-gray-400">\uc790\uc138\ud55c \ub0b4\uc6a9\uc744 \uc54c\ub824\uc8fc\uc138\uc694 (\uc120\ud0dd)</p>
                </div>

                {/* \uc120\ud0dd\ub41c \uac10\uc815 + \uce74\ud14c\uace0\ub9ac \ud45c\uc2dc */}
                <div className="flex items-center gap-2 text-[12px] text-gray-500">
                  <span className="text-[18px]">{EMOTIONS.find(e => e.value === emotion)?.emoji}</span>
                  <span className="px-2 py-0.5 bg-[#1e1e2e] rounded-md">{CATEGORIES.find(c => c.id === category)?.label}</span>
                </div>

                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="\ubb34\uc5c7\uc774\ub4e0 \uc790\uc720\ub86d\uac8c \uc801\uc5b4\uc8fc\uc138\uc694..."
                  rows={3}
                  className="w-full bg-[#0d0d14] border border-[#2a2a3e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50 resize-none"
                />

                {/* \uc2a4\ud06c\ub9b0\uc0f7 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={captureScreenshot}
                    disabled={screenshotLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-gray-400 bg-[#1e1e2e] hover:bg-[#2a2a3e] rounded-lg transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {screenshotLoading ? 'hourglass_empty' : screenshot ? 'check_circle' : 'screenshot_monitor'}
                    </span>
                    {screenshot ? '\uc2a4\ud06c\ub9b0\uc0f7 \ucca8\ubd80\ub428' : '\uc2a4\ud06c\ub9b0\uc0f7 \ucca8\ubd80'}
                  </button>
                  {screenshot && (
                    <button onClick={() => setScreenshot(null)} className="text-[11px] text-gray-600 hover:text-red-400 transition-colors">
                      \uc81c\uac70
                    </button>
                  )}
                </div>

                {/* \uc81c\ucd9c */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-2.5 bg-gradient-to-r from-[#00D4D4] to-[#0099CC] text-white text-sm font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {submitting ? '\ubcf4\ub0b4\ub294 \uc911...' : '\ud53c\ub4dc\ubc31 \ubcf4\ub0b4\uae30'}
                </button>
              </div>
            )}

            {/* Done */}
            {step === 'done' && (
              <div className="flex flex-col items-center py-6 gap-3">
                <span className="text-[48px] animate-bounce">\ud83d\ude4f</span>
                <p className="text-sm text-white font-semibold">\uac10\uc0ac\ud569\ub2c8\ub2e4!</p>
                <p className="text-[12px] text-gray-500">\uc18c\uc911\ud55c \ud53c\ub4dc\ubc31 \ubc18\uc601\ud558\uaca0\uc2b5\ub2c8\ub2e4.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** \uc138\uc158 ID (\ud0ed \ub2e8\uc704 \uc720\uc9c0) */
function getSessionId(): string {
  const KEY = 'feedback_session_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
