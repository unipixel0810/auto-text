'use client';

import { useState, useEffect, useCallback } from 'react';

interface PageElement {
  id: string;
  type: 'button' | 'heading' | 'text' | 'link';
  selector: string;
  currentText: string;
  tagName: string;
  className?: string;
}

interface ExperimentConfig {
  name: string;
  pageUrl: string;
  elementSelector: string;
  variantA: string;
  variantB: string;
  elementType: string;
}

export default function CreateExperimentPage() {
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [elements, setElements] = useState<PageElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedElement, setSelectedElement] = useState<PageElement | null>(null);
  const [experimentName, setExperimentName] = useState('');
  const [variantA, setVariantA] = useState('');
  const [variantB, setVariantB] = useState('');
  const [savedExperiments, setSavedExperiments] = useState<ExperimentConfig[]>([]);

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
      // 페이지를 iframe으로 로드하여 실제 요소들을 스캔
      const res = await fetch(`/api/ab-experiments/scan?page=${encodeURIComponent(selectedPage)}`);
      const data = await res.json();
      
      if (data.elements) {
        setElements(data.elements);
      } else {
        // 클라이언트 사이드에서 직접 스캔
        const scanned = await scanElementsClientSide();
        setElements(scanned);
      }
    } catch (err) {
      console.error('Failed to scan elements:', err);
      // Fallback: 클라이언트 사이드 스캔
      const scanned = await scanElementsClientSide();
      setElements(scanned);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  };

  const scanElementsClientSide = async (): Promise<PageElement[]> => {
    return new Promise((resolve) => {
      // 새 창/탭에서 페이지를 열어서 스캔
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

          // CTA 버튼 찾기 (button, a 태그 중 클릭 가능한 것들)
          const buttons = iframeDoc.querySelectorAll('button, a[href], [role="button"]');
          buttons.forEach((el, idx) => {
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

          // 헤드라인 찾기 (h1-h6)
          const headings = iframeDoc.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach((el, idx) => {
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

          // 중요한 텍스트 찾기 (data-track="cta" 등)
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
    setVariantA(element.currentText);
    setVariantB('');
    setExperimentName(`test-${element.type}-${Date.now()}`);
  };

  const saveExperiment = async () => {
    if (!selectedElement || !experimentName || !variantA || !variantB) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ab-experiments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: experimentName,
          pageUrl: selectedPage,
          elementSelector: selectedElement.selector,
          variantA,
          variantB,
          elementType: selectedElement.type,
        }),
      });

      if (res.ok) {
        alert('실험이 생성되었습니다! 페이지에 자동으로 적용됩니다.');
        await fetchSavedExperiments();
        // 폼 리셋
        setSelectedElement(null);
        setExperimentName('');
        setVariantA('');
        setVariantB('');
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

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#222] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0d0d0d] z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/experiments" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">add_circle</span>
          <h1 className="text-lg font-semibold">새 A/B 테스트 실험 생성</h1>
        </div>
      </header>

      <main className="p-8 max-w-6xl mx-auto">
        {/* Step 1: 페이지 선택 */}
        <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">web</span>
            1. 테스트할 페이지 선택
          </h2>
          <div className="flex gap-3">
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="flex-1 bg-black border border-[#333] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#00D4D4]"
            >
              <option value="">페이지를 선택하세요</option>
              {pages.map(page => (
                <option key={page} value={page}>{page}</option>
              ))}
            </select>
            <button
              onClick={scanPageElements}
              disabled={!selectedPage || scanning}
              className="px-4 py-2 bg-[#00D4D4] text-black rounded-lg font-bold hover:bg-[#00b8b8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        </div>

        {/* Step 2: 요소 선택 */}
        {elements.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">select_all</span>
              2. 테스트할 요소 선택 ({elements.length}개 발견)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {elements.map(element => (
                <button
                  key={element.id}
                  onClick={() => handleElementSelect(element)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    selectedElement?.id === element.id
                      ? 'bg-[#00D4D4]/10 border-[#00D4D4]'
                      : 'bg-black/30 border-[#333] hover:border-[#555]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
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
          </div>
        )}

        {/* Step 3: Variant 설정 */}
        {selectedElement && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">edit</span>
              3. Variant A/B 설정
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">실험 이름</label>
                <input
                  type="text"
                  value={experimentName}
                  onChange={(e) => setExperimentName(e.target.value)}
                  placeholder="예: homepage-cta-button"
                  className="w-full bg-black border border-[#333] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#00D4D4]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-2">
                    Variant A (현재 텍스트)
                  </label>
                  <input
                    type="text"
                    value={variantA}
                    onChange={(e) => setVariantA(e.target.value)}
                    className="w-full bg-black border border-[#333] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#00D4D4]"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">현재: {selectedElement.currentText}</p>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-2">
                    Variant B (테스트 텍스트)
                  </label>
                  <input
                    type="text"
                    value={variantB}
                    onChange={(e) => setVariantB(e.target.value)}
                    placeholder="새로운 텍스트를 입력하세요"
                    className="w-full bg-black border border-[#333] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#00D4D4]"
                  />
                </div>
              </div>

              <button
                onClick={saveExperiment}
                disabled={loading || !experimentName || !variantA || !variantB}
                className="w-full px-6 py-3 bg-[#00D4D4] text-black rounded-lg font-bold hover:bg-[#00b8b8] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                    저장 중...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    실험 생성 및 적용
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 저장된 실험 목록 */}
        {savedExperiments.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6">
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
