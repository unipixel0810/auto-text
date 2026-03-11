'use client';

import { useState, useEffect, useCallback } from 'react';

interface ExperimentConfig {
  name: string;
  description: string;
  pageUrl: string;
  elementSelector: string;
  variantA: { name: string; description: string; text: string };
  variantB: { name: string; description: string; text: string };
  trafficAllocation: number;
  goalType: 'click' | 'pageview' | 'custom_event';
  goalSelector: string;
  goalUrl: string;
  goalEventName: string;
  duration: number;
  elementType: string;
}

interface PageElement {
  id: string;
  type: 'button' | 'heading' | 'text' | 'link';
  selector: string;
  currentText: string;
  tagName: string;
  className?: string;
}

interface SavedExperiment {
  name: string;
  pageUrl: string;
  elementSelector: string;
  variantA: string;
  variantB: string;
  elementType: string;
}

interface ValidationErrors {
  name?: string;
  pageUrl?: string;
  variantA?: string;
  variantB?: string;
  goal?: string;
}

export default function CreateExperimentPage() {
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [elements, setElements] = useState<PageElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedElement, setSelectedElement] = useState<PageElement | null>(null);
  const [savedExperiments, setSavedExperiments] = useState<SavedExperiment[]>([]);

  // Form state
  const [experimentName, setExperimentName] = useState('');
  const [description, setDescription] = useState('');
  const [variantAName, setVariantAName] = useState('컨트롤 (A)');
  const [variantADesc, setVariantADesc] = useState('');
  const [variantAText, setVariantAText] = useState('');
  const [variantBName, setVariantBName] = useState('테스트 (B)');
  const [variantBDesc, setVariantBDesc] = useState('');
  const [variantBText, setVariantBText] = useState('');
  const [trafficAllocation, setTrafficAllocation] = useState(50);
  const [goalType, setGoalType] = useState<'click' | 'pageview' | 'custom_event'>('click');
  const [goalSelector, setGoalSelector] = useState('');
  const [goalUrl, setGoalUrl] = useState('');
  const [goalEventName, setGoalEventName] = useState('');
  const [duration, setDuration] = useState(14);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [activeStep, setActiveStep] = useState(1);

  // 샘플 사이즈 계산기
  const [baselineCTR, setBaselineCTR] = useState(3);
  const [mde, setMde] = useState(20);

  // MDE 기반 필요 샘플 사이즈 계산 (양측검정, alpha=0.05, power=0.8)
  const calcRequiredSampleSize = (ctrPct: number, mdePct: number): number => {
    const p1 = ctrPct / 100;
    const p2 = p1 * (1 + mdePct / 100);
    if (p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1) return 0;
    const pooled = (p1 + p2) / 2;
    const z_alpha = 1.96;
    const z_beta = 0.842;
    const n = 2 * pooled * (1 - pooled) * Math.pow(z_alpha + z_beta, 2) / Math.pow(p2 - p1, 2);
    return Math.ceil(n);
  };

  useEffect(() => {
    fetchPages();
    fetchSavedExperiments();
  }, []);

  const fetchPages = async () => {
    try {
      const res = await fetch('/api/analytics/query?action=pages&days=30');
      const data = await res.json();
      const pageList: string[] = data.pages || [];
      setPages(pageList.filter(p => !p.startsWith('/admin')));
    } catch (err) {
      console.error('Failed to fetch pages:', err);
    }
  };

  const fetchSavedExperiments = async () => {
    try {
      const res = await fetch('/api/ab-experiments/list');
      const data = await res.json();
      setSavedExperiments(data.experiments || []);
    } catch (err) {
      console.error('Failed to fetch experiments:', err);
    }
  };

  const scanPageElements = async () => {
    if (!selectedPage) return;

    setScanning(true);
    setLoading(true);

    try {
      const res = await fetch(`/api/ab-experiments/scan?page=${encodeURIComponent(selectedPage)}`);
      const data = await res.json();

      if (data.elements) {
        setElements(data.elements);
      } else {
        const scanned = await scanElementsClientSide();
        setElements(scanned);
      }
    } catch (err) {
      console.error('Failed to scan elements:', err);
      const scanned = await scanElementsClientSide();
      setElements(scanned);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  };

  const scanElementsClientSide = async (): Promise<PageElement[]> => {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = selectedPage.startsWith('http') ? selectedPage : `${window.location.origin}${selectedPage}`;

      iframe.onload = () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) {
            resolve([]);
            return;
          }

          const found: PageElement[] = [];
          let idCounter = 0;

          const buttons = iframeDoc.querySelectorAll('button, a[href], [role="button"]');
          buttons.forEach((el) => {
            const text = el.textContent?.trim() || '';
            if (text.length > 0 && text.length < 100) {
              found.push({
                id: `btn-${idCounter++}`,
                type: 'button',
                selector: generateSelector(el as HTMLElement),
                currentText: text,
                tagName: el.tagName.toLowerCase(),
                className: el.className || undefined,
              });
            }
          });

          const headings = iframeDoc.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach((el) => {
            const text = el.textContent?.trim() || '';
            if (text.length > 0 && text.length < 200) {
              found.push({
                id: `heading-${idCounter++}`,
                type: 'heading',
                selector: generateSelector(el as HTMLElement),
                currentText: text,
                tagName: el.tagName.toLowerCase(),
                className: el.className || undefined,
              });
            }
          });

          const trackedElements = iframeDoc.querySelectorAll('[data-track="cta"], [data-cta], .cta, .btn-primary, .button-primary');
          trackedElements.forEach((el) => {
            const text = el.textContent?.trim() || '';
            if (text.length > 0 && text.length < 100 && !found.some(e => e.currentText === text)) {
              found.push({
                id: `cta-${idCounter++}`,
                type: 'button',
                selector: generateSelector(el as HTMLElement),
                currentText: text,
                tagName: el.tagName.toLowerCase(),
                className: el.className || undefined,
              });
            }
          });

          resolve(found);
        } catch (err) {
          console.error('Error scanning iframe:', err);
          resolve([]);
        } finally {
          document.body.removeChild(iframe);
        }
      };

      document.body.appendChild(iframe);
    });
  };

  const generateSelector = (el: HTMLElement): string => {
    if (el.id) return `#${el.id}`;
    if (el.className) {
      const classes = el.className.split(' ').filter(c => c.length > 0).join('.');
      if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
    }
    return el.tagName.toLowerCase();
  };

  const handleElementSelect = (element: PageElement) => {
    setSelectedElement(element);
    setVariantAText(element.currentText);
    setVariantBText('');
    if (!experimentName) {
      setExperimentName(`test-${element.type}-${Date.now()}`);
    }
    if (goalType === 'click' && !goalSelector) {
      setGoalSelector(element.selector);
    }
    setActiveStep(3);
  };

  const validate = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (!experimentName.trim()) {
      newErrors.name = '실험 이름을 입력해주세요.';
    }
    if (!selectedPage) {
      newErrors.pageUrl = '테스트할 페이지를 선택해주세요.';
    }
    if (!variantAText.trim()) {
      newErrors.variantA = 'Variant A 텍스트를 입력해주세요.';
    }
    if (!variantBText.trim()) {
      newErrors.variantB = 'Variant B 텍스트를 입력해주세요.';
    }
    if (goalType === 'click' && !goalSelector.trim()) {
      newErrors.goal = '클릭 목표의 CSS 선택자를 입력해주세요.';
    }
    if (goalType === 'pageview' && !goalUrl.trim()) {
      newErrors.goal = '목표 페이지 URL을 입력해주세요.';
    }
    if (goalType === 'custom_event' && !goalEventName.trim()) {
      newErrors.goal = '커스텀 이벤트 이름을 입력해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveExperiment = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ab-experiments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: experimentName,
          description,
          pageUrl: selectedPage,
          elementSelector: selectedElement?.selector || '',
          variantA: variantAText,
          variantB: variantBText,
          variantAName,
          variantBName,
          variantADesc,
          variantBDesc,
          trafficAllocation,
          goalType,
          goalSelector,
          goalUrl,
          goalEventName,
          duration,
          elementType: selectedElement?.type || 'button',
        }),
      });

      if (res.ok) {
        alert('실험이 생성되었습니다! 페이지에 자동으로 적용됩니다.');
        await fetchSavedExperiments();
        resetForm();
      } else {
        alert('실험 생성에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to save experiment:', err);
      alert('실험 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedElement(null);
    setExperimentName('');
    setDescription('');
    setVariantAName('컨트롤 (A)');
    setVariantADesc('');
    setVariantAText('');
    setVariantBName('테스트 (B)');
    setVariantBDesc('');
    setVariantBText('');
    setTrafficAllocation(50);
    setGoalType('click');
    setGoalSelector('');
    setGoalUrl('');
    setGoalEventName('');
    setDuration(14);
    setErrors({});
    setActiveStep(1);
  };

  const steps = [
    { num: 1, label: '기본 정보', icon: 'info' },
    { num: 2, label: '요소 선택', icon: 'select_all' },
    { num: 3, label: '변형 설정', icon: 'edit' },
    { num: 4, label: '목표 및 기간', icon: 'flag' },
    { num: 5, label: '미리보기', icon: 'preview' },
  ];

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#222] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0d0d0d]/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/experiments" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">add_circle</span>
          <h1 className="text-lg font-semibold">새 A/B 테스트 실험 생성</h1>
        </div>
      </header>

      <main className="p-8 max-w-5xl mx-auto">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8 px-4">
          {steps.map((step, i) => (
            <div key={step.num} className="flex items-center">
              <button
                onClick={() => setActiveStep(step.num)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                  activeStep === step.num
                    ? 'bg-[#00D4D4]/10 text-[#00D4D4] ring-1 ring-[#00D4D4]/30'
                    : activeStep > step.num
                    ? 'text-green-400'
                    : 'text-gray-600'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{step.icon}</span>
                <span className="text-xs font-bold">{step.label}</span>
              </button>
              {i < steps.length - 1 && (
                <div className={`w-8 h-px mx-1 ${activeStep > step.num ? 'bg-green-500/30' : 'bg-[#333]'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {activeStep === 1 && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-gray-400 mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">info</span>
              1. 기본 정보
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-xs text-gray-500 mb-2">실험 이름 *</label>
                <input
                  type="text"
                  value={experimentName}
                  onChange={(e) => { setExperimentName(e.target.value); setErrors(prev => ({ ...prev, name: undefined })); }}
                  placeholder="예: homepage-cta-button-test"
                  className={`w-full bg-black border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#00D4D4] transition-colors ${
                    errors.name ? 'border-red-500' : 'border-[#333]'
                  }`}
                />
                {errors.name && <p className="text-red-400 text-[10px] mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">실험 설명</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="이 실험의 목적과 가설을 설명해주세요..."
                  rows={3}
                  className="w-full bg-black border border-[#333] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#00D4D4] resize-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">대상 페이지 URL *</label>
                <div className="flex gap-3">
                  <select
                    value={selectedPage}
                    onChange={(e) => { setSelectedPage(e.target.value); setErrors(prev => ({ ...prev, pageUrl: undefined })); }}
                    className={`flex-1 bg-black border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#00D4D4] transition-colors ${
                      errors.pageUrl ? 'border-red-500' : 'border-[#333]'
                    }`}
                  >
                    <option value="">페이지를 선택하세요</option>
                    {pages.map(page => (
                      <option key={page} value={page}>{page}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { scanPageElements(); setActiveStep(2); }}
                    disabled={!selectedPage || scanning}
                    className="px-5 py-3 bg-[#00D4D4] text-black rounded-lg font-bold hover:bg-[#00b8b8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                  >
                    {scanning ? (
                      <>
                        <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                        스캔 중...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">search</span>
                        요소 스캔
                      </>
                    )}
                  </button>
                </div>
                {errors.pageUrl && <p className="text-red-400 text-[10px] mt-1">{errors.pageUrl}</p>}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setActiveStep(2)}
                  className="px-6 py-2.5 bg-[#222] text-white rounded-lg text-sm font-bold hover:bg-[#333] transition-all flex items-center gap-2"
                >
                  다음
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Element Selection */}
        {activeStep === 2 && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">select_all</span>
              2. 테스트할 요소 선택
            </h2>

            {!selectedPage ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-[32px] text-gray-700 mb-2">web</span>
                <p className="text-gray-500 text-sm">먼저 기본 정보 단계에서 페이지를 선택해주세요.</p>
                <button
                  onClick={() => setActiveStep(1)}
                  className="mt-4 text-[#00D4D4] text-sm hover:underline"
                >
                  이전 단계로
                </button>
              </div>
            ) : elements.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-[32px] text-gray-700 mb-2">search</span>
                <p className="text-gray-500 text-sm mb-4">요소 스캔을 실행하여 테스트 가능한 요소를 찾아보세요.</p>
                <button
                  onClick={scanPageElements}
                  disabled={scanning}
                  className="px-5 py-2.5 bg-[#00D4D4] text-black rounded-lg font-bold hover:bg-[#00b8b8] disabled:opacity-50 flex items-center gap-2 mx-auto transition-all"
                >
                  {scanning ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                      스캔 중...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">search</span>
                      요소 스캔 시작
                    </>
                  )}
                </button>
              </div>
            ) : (
              <>
                <p className="text-gray-500 text-xs mb-4">{elements.length}개의 테스트 가능한 요소를 발견했습니다.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                  {elements.map(element => (
                    <button
                      key={element.id}
                      onClick={() => handleElementSelect(element)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        selectedElement?.id === element.id
                          ? 'bg-[#00D4D4]/10 border-[#00D4D4] ring-1 ring-[#00D4D4]/20'
                          : 'bg-black/30 border-[#333] hover:border-[#555]'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase bg-[#222] px-2 py-0.5 rounded">
                          {element.type === 'button' ? '버튼' : element.type === 'heading' ? '헤드라인' : '텍스트'}
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono">{element.tagName}</span>
                      </div>
                      <p className="text-sm text-white font-medium line-clamp-2">{element.currentText}</p>
                      {element.className && (
                        <p className="text-[10px] text-gray-600 mt-1 font-mono truncate">{element.className}</p>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setActiveStep(1)}
                className="px-6 py-2.5 bg-[#222] text-gray-400 rounded-lg text-sm font-bold hover:bg-[#333] hover:text-white transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                이전
              </button>
              <button
                onClick={() => setActiveStep(3)}
                className="px-6 py-2.5 bg-[#222] text-white rounded-lg text-sm font-bold hover:bg-[#333] transition-all flex items-center gap-2"
              >
                다음
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Variant Configuration */}
        {activeStep === 3 && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-gray-400 mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">edit</span>
              3. 변형 설정
            </h2>

            <div className="space-y-6">
              {/* Traffic Allocation Slider */}
              <div>
                <label className="block text-xs text-gray-500 mb-3">트래픽 배분</label>
                <div className="bg-black/30 rounded-xl p-4 border border-[#222]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-[#00D4D4]">A: {trafficAllocation}%</span>
                    <span className="text-sm font-bold text-[#a78bfa]">B: {100 - trafficAllocation}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={trafficAllocation}
                    onChange={(e) => setTrafficAllocation(parseInt(e.target.value))}
                    className="w-full h-2 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-gray-600">10%</span>
                    <span className="text-[10px] text-gray-500">50/50 권장</span>
                    <span className="text-[10px] text-gray-600">90%</span>
                  </div>
                </div>
              </div>

              {/* Variant A */}
              <div className="bg-black/20 rounded-xl p-5 border border-[#00D4D4]/20">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded bg-[#00D4D4]/20 flex items-center justify-center text-[#00D4D4] text-xs font-black">A</div>
                  <span className="text-xs font-bold text-gray-400">컨트롤 변형</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">변형 이름</label>
                    <input
                      type="text"
                      value={variantAName}
                      onChange={(e) => setVariantAName(e.target.value)}
                      className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00D4D4] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">설명</label>
                    <input
                      type="text"
                      value={variantADesc}
                      onChange={(e) => setVariantADesc(e.target.value)}
                      placeholder="현재 버전"
                      className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00D4D4] transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 mb-1">표시 텍스트 *</label>
                  <input
                    type="text"
                    value={variantAText}
                    onChange={(e) => { setVariantAText(e.target.value); setErrors(prev => ({ ...prev, variantA: undefined })); }}
                    className={`w-full bg-black border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00D4D4] transition-colors ${
                      errors.variantA ? 'border-red-500' : 'border-[#333]'
                    }`}
                  />
                  {errors.variantA && <p className="text-red-400 text-[10px] mt-1">{errors.variantA}</p>}
                  {selectedElement && (
                    <p className="text-[10px] text-gray-600 mt-1">원본: {selectedElement.currentText}</p>
                  )}
                </div>
              </div>

              {/* Variant B */}
              <div className="bg-black/20 rounded-xl p-5 border border-[#a78bfa]/20">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded bg-[#a78bfa]/20 flex items-center justify-center text-[#a78bfa] text-xs font-black">B</div>
                  <span className="text-xs font-bold text-gray-400">테스트 변형</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">변형 이름</label>
                    <input
                      type="text"
                      value={variantBName}
                      onChange={(e) => setVariantBName(e.target.value)}
                      className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#a78bfa] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">설명</label>
                    <input
                      type="text"
                      value={variantBDesc}
                      onChange={(e) => setVariantBDesc(e.target.value)}
                      placeholder="테스트하려는 변경 사항"
                      className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#a78bfa] transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 mb-1">표시 텍스트 *</label>
                  <input
                    type="text"
                    value={variantBText}
                    onChange={(e) => { setVariantBText(e.target.value); setErrors(prev => ({ ...prev, variantB: undefined })); }}
                    placeholder="새로운 텍스트를 입력하세요"
                    className={`w-full bg-black border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#a78bfa] transition-colors ${
                      errors.variantB ? 'border-red-500' : 'border-[#333]'
                    }`}
                  />
                  {errors.variantB && <p className="text-red-400 text-[10px] mt-1">{errors.variantB}</p>}
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setActiveStep(2)}
                className="px-6 py-2.5 bg-[#222] text-gray-400 rounded-lg text-sm font-bold hover:bg-[#333] hover:text-white transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                이전
              </button>
              <button
                onClick={() => setActiveStep(4)}
                className="px-6 py-2.5 bg-[#222] text-white rounded-lg text-sm font-bold hover:bg-[#333] transition-all flex items-center gap-2"
              >
                다음
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Goal & Duration */}
        {activeStep === 4 && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-gray-400 mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">flag</span>
              4. 목표 정의 및 실험 기간
            </h2>

            <div className="space-y-6">
              {/* Goal Type */}
              <div>
                <label className="block text-xs text-gray-500 mb-3">전환 목표 유형</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'click' as const, label: '클릭', icon: 'ads_click', desc: '특정 요소 클릭' },
                    { value: 'pageview' as const, label: '페이지뷰', icon: 'visibility', desc: '특정 페이지 방문' },
                    { value: 'custom_event' as const, label: '커스텀 이벤트', icon: 'code', desc: '사용자 정의 이벤트' },
                  ].map(g => (
                    <button
                      key={g.value}
                      onClick={() => { setGoalType(g.value); setErrors(prev => ({ ...prev, goal: undefined })); }}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        goalType === g.value
                          ? 'bg-[#00D4D4]/10 border-[#00D4D4] ring-1 ring-[#00D4D4]/20'
                          : 'bg-black/30 border-[#333] hover:border-[#555]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px] mb-2 block" style={{ color: goalType === g.value ? '#00D4D4' : '#666' }}>
                        {g.icon}
                      </span>
                      <p className="text-sm font-bold">{g.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{g.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Goal Config */}
              {goalType === 'click' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-2">클릭 대상 CSS 선택자 *</label>
                  <input
                    type="text"
                    value={goalSelector}
                    onChange={(e) => { setGoalSelector(e.target.value); setErrors(prev => ({ ...prev, goal: undefined })); }}
                    placeholder="예: #signup-btn, .cta-button"
                    className={`w-full bg-black border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#00D4D4] transition-colors ${
                      errors.goal ? 'border-red-500' : 'border-[#333]'
                    }`}
                  />
                  {errors.goal && <p className="text-red-400 text-[10px] mt-1">{errors.goal}</p>}
                </div>
              )}

              {goalType === 'pageview' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-2">목표 페이지 URL *</label>
                  <input
                    type="text"
                    value={goalUrl}
                    onChange={(e) => { setGoalUrl(e.target.value); setErrors(prev => ({ ...prev, goal: undefined })); }}
                    placeholder="예: /signup/complete, /thank-you"
                    className={`w-full bg-black border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#00D4D4] transition-colors ${
                      errors.goal ? 'border-red-500' : 'border-[#333]'
                    }`}
                  />
                  {errors.goal && <p className="text-red-400 text-[10px] mt-1">{errors.goal}</p>}
                </div>
              )}

              {goalType === 'custom_event' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-2">커스텀 이벤트 이름 *</label>
                  <input
                    type="text"
                    value={goalEventName}
                    onChange={(e) => { setGoalEventName(e.target.value); setErrors(prev => ({ ...prev, goal: undefined })); }}
                    placeholder="예: purchase_complete, form_submit"
                    className={`w-full bg-black border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#00D4D4] transition-colors ${
                      errors.goal ? 'border-red-500' : 'border-[#333]'
                    }`}
                  />
                  {errors.goal && <p className="text-red-400 text-[10px] mt-1">{errors.goal}</p>}
                </div>
              )}

              {/* Sample Size Calculator */}
              <div className="bg-black/30 rounded-xl p-5 border border-[#222]">
                <h3 className="text-xs font-bold text-gray-400 mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#00D4D4]">calculate</span>
                  필요 샘플 사이즈 계산기
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1.5">
                      현재 A 변형 CTR (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0.1}
                        max={99}
                        step={0.1}
                        value={baselineCTR}
                        onChange={(e) => setBaselineCTR(parseFloat(e.target.value) || 1)}
                        className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#00D4D4] transition-colors"
                      />
                      <span className="text-gray-500 text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1.5">
                      최소 탐지 효과 크기 MDE (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        step={1}
                        value={mde}
                        onChange={(e) => setMde(parseInt(e.target.value) || 10)}
                        className="w-full bg-black border border-[#333] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#00D4D4] transition-colors"
                      />
                      <span className="text-gray-500 text-sm">%</span>
                    </div>
                  </div>
                </div>
                {(() => {
                  const n = calcRequiredSampleSize(baselineCTR, mde);
                  const total = n * 2;
                  return n > 0 ? (
                    <div className="bg-[#00D4D4]/5 rounded-lg p-3 border border-[#00D4D4]/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-gray-500 mb-0.5">변형당 필요 노출수</p>
                          <p className="text-xl font-black font-mono text-[#00D4D4]">{n.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-500 mb-0.5">총 필요 노출수</p>
                          <p className="text-xl font-black font-mono text-white">{total.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-500 mb-0.5">검정력 80% · 유의수준 5%</p>
                          <p className="text-[10px] text-gray-400">
                            A: {baselineCTR}% → B: {(baselineCTR * (1 + mde / 100)).toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-red-400 text-xs">유효한 CTR과 MDE 값을 입력해주세요.</p>
                  );
                })()}
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs text-gray-500 mb-3">실험 기간 (일)</label>
                <div className="bg-black/30 rounded-xl p-4 border border-[#222]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-black text-white">{duration}일</span>
                    <span className="text-[10px] text-gray-500">
                      종료 예정: {new Date(Date.now() + duration * 86400000).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={90}
                    step={1}
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value))}
                    className="w-full h-2 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-gray-600">3일</span>
                    <div className="flex gap-2">
                      {[7, 14, 30, 60].map(d => (
                        <button
                          key={d}
                          onClick={() => setDuration(d)}
                          className={`text-[10px] px-2 py-0.5 rounded ${
                            duration === d ? 'bg-[#00D4D4]/20 text-[#00D4D4]' : 'text-gray-500 hover:text-white'
                          }`}
                        >
                          {d}일
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-600">90일</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setActiveStep(3)}
                className="px-6 py-2.5 bg-[#222] text-gray-400 rounded-lg text-sm font-bold hover:bg-[#333] hover:text-white transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                이전
              </button>
              <button
                onClick={() => setActiveStep(5)}
                className="px-6 py-2.5 bg-[#222] text-white rounded-lg text-sm font-bold hover:bg-[#333] transition-all flex items-center gap-2"
              >
                미리보기
                <span className="material-symbols-outlined text-[16px]">preview</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Preview & Submit */}
        {activeStep === 5 && (
          <div className="space-y-6">
            {/* Preview */}
            <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6">
              <h2 className="text-sm font-bold text-gray-400 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">preview</span>
                5. 실험 미리보기
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Variant A Preview */}
                <div className="bg-black/30 rounded-xl p-5 border border-[#00D4D4]/20">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded bg-[#00D4D4]/20 flex items-center justify-center text-[#00D4D4] text-xs font-black">A</div>
                    <span className="text-xs font-bold text-gray-400">{variantAName}</span>
                    <span className="text-[10px] text-gray-600 ml-auto">{trafficAllocation}% 트래픽</span>
                  </div>
                  {variantADesc && <p className="text-[10px] text-gray-500 mb-3">{variantADesc}</p>}
                  <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
                    {selectedElement?.type === 'button' ? (
                      <button className="px-6 py-2 bg-[#00D4D4] text-black rounded-lg font-bold text-sm cursor-default">
                        {variantAText || '(텍스트 미입력)'}
                      </button>
                    ) : selectedElement?.type === 'heading' ? (
                      <h3 className="text-lg font-bold text-white">{variantAText || '(텍스트 미입력)'}</h3>
                    ) : (
                      <p className="text-sm text-white">{variantAText || '(텍스트 미입력)'}</p>
                    )}
                  </div>
                </div>

                {/* Variant B Preview */}
                <div className="bg-black/30 rounded-xl p-5 border border-[#a78bfa]/20">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded bg-[#a78bfa]/20 flex items-center justify-center text-[#a78bfa] text-xs font-black">B</div>
                    <span className="text-xs font-bold text-gray-400">{variantBName}</span>
                    <span className="text-[10px] text-gray-600 ml-auto">{100 - trafficAllocation}% 트래픽</span>
                  </div>
                  {variantBDesc && <p className="text-[10px] text-gray-500 mb-3">{variantBDesc}</p>}
                  <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
                    {selectedElement?.type === 'button' ? (
                      <button className="px-6 py-2 bg-[#a78bfa] text-black rounded-lg font-bold text-sm cursor-default">
                        {variantBText || '(텍스트 미입력)'}
                      </button>
                    ) : selectedElement?.type === 'heading' ? (
                      <h3 className="text-lg font-bold text-white">{variantBText || '(텍스트 미입력)'}</h3>
                    ) : (
                      <p className="text-sm text-white">{variantBText || '(텍스트 미입력)'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-black/30 rounded-xl p-5 border border-[#222]">
                <h3 className="text-xs font-bold text-gray-400 mb-4">실험 요약</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">실험 이름</p>
                    <p className="text-white font-bold truncate">{experimentName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">대상 페이지</p>
                    <p className="text-white font-mono text-xs truncate">{selectedPage || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">트래픽 배분</p>
                    <p className="text-white font-bold">{trafficAllocation}% / {100 - trafficAllocation}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">실험 기간</p>
                    <p className="text-white font-bold">{duration}일</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">목표 유형</p>
                    <p className="text-white font-bold">
                      {goalType === 'click' ? '클릭' : goalType === 'pageview' ? '페이지뷰' : '커스텀 이벤트'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">목표 대상</p>
                    <p className="text-white font-mono text-xs truncate">
                      {goalType === 'click' ? goalSelector : goalType === 'pageview' ? goalUrl : goalEventName || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">요소 타입</p>
                    <p className="text-white font-bold">{selectedElement?.type || '미선택'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-1">종료일</p>
                    <p className="text-white font-bold">{new Date(Date.now() + duration * 86400000).toLocaleDateString('ko-KR')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between">
              <button
                onClick={() => setActiveStep(4)}
                className="px-6 py-2.5 bg-[#222] text-gray-400 rounded-lg text-sm font-bold hover:bg-[#333] hover:text-white transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                이전
              </button>
              <button
                onClick={saveExperiment}
                disabled={loading}
                className="px-8 py-3 bg-[#00D4D4] text-black rounded-lg font-bold hover:bg-[#00b8b8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all text-sm"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                    생성 중...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
                    실험 생성 및 시작
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Saved Experiments */}
        {savedExperiments.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mt-6">
            <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">list</span>
              활성화된 실험 목록
            </h2>
            <div className="space-y-2">
              {savedExperiments.map(exp => (
                <div key={exp.name} className="bg-black/30 rounded-lg p-4 border border-[#333]">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-[#00D4D4] mb-1">{exp.name}</h3>
                      <p className="text-xs text-gray-500 mb-2">{exp.pageUrl}</p>
                      <div className="flex gap-4 text-xs text-gray-400">
                        <span>A: {exp.variantA}</span>
                        <span>B: {exp.variantB}</span>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm('이 실험을 삭제하시겠습니까?')) {
                          await fetch(`/api/ab-experiments/delete?name=${encodeURIComponent(exp.name)}`, { method: 'DELETE' });
                          await fetchSavedExperiments();
                        }
                      }}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
