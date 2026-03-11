'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function LandingPage() {
    const router = useRouter();

    // 랜딩 페이지에서 body 스크롤 강제 활성화
    useEffect(() => {
        const body = document.body;
        const originalOverflow = body.style.overflow;
        body.style.overflow = 'auto';
        body.classList.remove('overflow-hidden');

        // MutationObserver로 외부에서 overflow-hidden 재추가 시 즉시 제거
        const observer = new MutationObserver(() => {
            if (body.classList.contains('overflow-hidden')) {
                body.classList.remove('overflow-hidden');
            }
            if (body.style.overflow === 'hidden') {
                body.style.overflow = 'auto';
            }
        });
        observer.observe(body, { attributes: true, attributeFilter: ['class', 'style'] });

        return () => {
            observer.disconnect();
            body.style.overflow = originalOverflow;
        };
    }, []);

    return (
        <div className="min-h-screen bg-editor-bg text-white font-display overflow-auto">
            {/* Top Navigation Bar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-editor-bg/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/landing')}>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <span className="material-icons text-white text-lg">auto_awesome</span>
                        </div>
                        <span className="text-lg font-bold tracking-tight">AutoText</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
                            data-ab-test="nav-cta-test"
                            data-ab-variant-b="무료로 시작하기"
                        >
                            회원가입
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-16 px-4 overflow-hidden">
                {/* Background Gradients */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-20 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary rounded-full blur-[120px]"></div>
                    <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-purple-600 rounded-full blur-[100px]"></div>
                </div>

                <div className="max-w-6xl mx-auto text-center">
                    <div className="inline-block px-4 py-1.5 mb-6 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                        <span className="text-primary text-xs font-bold tracking-widest uppercase">✨ AI Auto Subtitle</span>
                    </div>

                    {/* ========== A/B TEST: 메인 헤드라인 ========== */}
                    <h1
                        className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight leading-[1.1]"
                        data-ab-test="main-headline-test"
                        data-ab-variant-b="3분 만에 시작하는 AI 자막 편집기"
                    >
                        <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">자동으로</span>
                        <br />
                        알고리즘이 선택한 자막을 추출
                    </h1>

                    {/* ========== A/B TEST 2: 서브 헤드라인 ========== */}
                    <p
                        className="text-gray-400 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
                        data-ab-test="sub-headline-test"
                        data-ab-variant-b="매달 100만 뷰를 달성하는 크리에이터들의 편집 비법을 AI가 분석했습니다."
                    >
                        업로드만 하면 끝. AI가 예능·상황·설명 자막을 자동으로 생성하고,
                        트렌드에 맞는 스타일까지 추천합니다.
                    </p>

                    {/* ========== CTA 버튼: 로그인 / 회원가입 ========== */}
                    <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-8">
                        <button
                            onClick={() => router.push('/')}
                            className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all w-full md:w-auto text-lg"
                            data-ab-test="cta-button-test"
                            data-ab-variant-b="30초만에 무료 체험하기"
                        >
                            지금 무료로 시작하기
                        </button>
                        <button
                            onClick={() => router.push('/')}
                            className="px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-xl hover:bg-white/10 transition-all w-full md:w-auto"
                        >
                            에디터 둘러보기
                        </button>
                    </div>

                    {/* 소셜 프루프 */}
                    <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
                        <span>🎯 현재 <strong className="text-white">2,847명</strong>의 크리에이터가 사용 중</span>
                        <span className="hidden md:inline">|</span>
                        <span className="hidden md:inline">💬 &quot;편집 시간이 반으로 줄었어요&quot; - 구독자 10만 유튜버</span>
                    </div>
                </div>
            </section>

            {/* 핵심 기능 카드 */}
            <section className="py-16 px-4">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
                        <span className="text-primary">핵심 기능</span>을 살펴보세요
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                title: 'AI 자막 분석',
                                desc: '영상 분위기에 맞는 폰트와 컬러를 자동 선택. 업로드만 하면 바로 적용!',
                                icon: 'auto_awesome',
                                testName: 'feature-ai-analysis',
                                link: '/landing/ai-analysis',
                            },
                            {
                                title: '알고리즘 트렌드',
                                desc: '유튜브 인기 채널의 자막 스타일을 실시간으로 반영. 트렌드를 놓치지 마세요.',
                                icon: 'trending_up',
                                testName: 'feature-algorithm-trend',
                                link: '/landing/algorithm-trend',
                            },
                            {
                                title: 'DNA 스타일링',
                                desc: '당신만의 고유한 편집 감성을 학습하고 자동화. 나만의 브랜드를 만들어보세요.',
                                icon: 'fingerprint',
                                testName: 'feature-dna-styling',
                                link: '/landing/dna-styling',
                            }
                        ].map((feature, idx) => (
                            <div
                                key={idx}
                                className="glass-card p-8 group hover:border-primary/50 transition-all cursor-pointer hover:scale-[1.02]"
                                data-ab-test={feature.testName}
                                onClick={() => router.push(feature.link)}
                            >
                                <span className="material-icons text-primary text-4xl mb-4 group-hover:scale-110 transition-transform block">
                                    {feature.icon}
                                </span>
                                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                <p className="text-gray-500 text-sm leading-relaxed mb-4">{feature.desc}</p>
                                <span className="text-primary text-xs font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
                                    자세히 보기 <span className="material-icons text-sm">arrow_forward</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 비교 표 섹션 */}
            <section className="py-16 px-4 border-t border-white/5">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
                        왜 <span className="text-primary">AutoText</span>인가요?
                    </h2>
                    <p className="text-gray-500 text-center mb-10 text-sm">다른 도구와 직접 비교해보세요</p>

                    <div className="overflow-hidden rounded-2xl border border-white/10">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-white/5">
                                    <th className="p-4 text-left text-gray-400 font-medium">기능</th>
                                    <th className="p-4 text-center text-primary font-bold">AutoText AI</th>
                                    <th className="p-4 text-center text-gray-500 font-medium">기존 편집기</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { feature: 'AI 자막 자동 생성', us: '✅', them: '❌' },
                                    { feature: '트렌드 스타일 반영', us: '✅ 실시간', them: '❌' },
                                    { feature: '편집 스타일 학습', us: '✅ 자동', them: '⚠️ 수동' },
                                    { feature: '자막 편집 시간', us: '⚡ 5분', them: '⏱️ 30분+' },
                                    { feature: '가격', us: '🆓 무료', them: '💰 월 $29+' },
                                ].map((row, idx) => (
                                    <tr key={idx} className={`border-t border-white/5 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                                        <td className="p-4 text-gray-300">{row.feature}</td>
                                        <td className="p-4 text-center font-semibold">{row.us}</td>
                                        <td className="p-4 text-center text-gray-500">{row.them}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* 최종 전환 CTA */}
            <section className="py-20 px-4">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-extrabold mb-6">
                        준비되셨나요? 지금 시작하세요.
                    </h2>
                    <p className="text-gray-400 mb-8">
                        클릭 한 번으로 바로 편집을 시작할 수 있습니다.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-10 py-5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-extrabold text-lg rounded-2xl shadow-2xl shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all"
                    >
                        무료로 시작하기 🚀
                    </button>
                    <p className="mt-4 text-xs text-gray-600">30초 이내에 첫 자막을 만들 수 있습니다</p>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/5 py-8 px-4">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-600">
                    <span>© 2026 AutoText. All rights reserved.</span>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-white transition-colors">이용약관</a>
                        <a href="#" className="hover:text-white transition-colors">개인정보처리방침</a>
                        <a href="#" className="hover:text-white transition-colors">문의하기</a>
                    </div>
                </div>
            </footer>

        </div>
    );
}
