'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEMO_SUBTITLES = [
    { id: 1, start: '00:00:01', end: '00:00:04', text: '안녕하세요, 오늘은 특별한 영상입니다', font: 'Noto Sans KR', color: '#FFFFFF', bg: '#000000CC', confidence: 98 },
    { id: 2, start: '00:00:04', end: '00:00:08', text: '구독자 여러분이 기다리던 편집 꿀팁!', font: 'Black Han Sans', color: '#FFD700', bg: '#1A1A2ECC', confidence: 95 },
    { id: 3, start: '00:00:08', end: '00:00:12', text: '자막은 영상의 가독성을 200% 높여줍니다', font: 'Jua', color: '#00FF88', bg: '#0D1117CC', confidence: 92 },
    { id: 4, start: '00:00:12', end: '00:00:16', text: '특히 숏폼에서는 자막이 필수라는 사실!', font: 'Do Hyeon', color: '#FF6B6B', bg: '#1E1E2ECC', confidence: 97 },
    { id: 5, start: '00:00:16', end: '00:00:20', text: '좋아요와 구독 부탁드려요~ 감사합니다', font: 'Nanum Gothic', color: '#88CCFF', bg: '#0A0A0FCC', confidence: 90 },
];

const AI_ANALYSIS = {
    mood: '밝고 에너제틱',
    genre: '유튜브 브이로그 / 정보성 콘텐츠',
    recommendedFont: 'Black Han Sans',
    recommendedColor: '#FFD700',
    moodScore: 87,
    readability: 94,
    trendMatch: 91,
};

export default function AIAnalysisPage() {
    const router = useRouter();
    const [selectedSub, setSelectedSub] = useState<number | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisComplete, setAnalysisComplete] = useState(true);

    const handleReAnalyze = () => {
        setAnalyzing(true);
        setAnalysisComplete(false);
        setTimeout(() => {
            setAnalyzing(false);
            setAnalysisComplete(true);
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white font-display">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#111118]">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/landing')} className="text-gray-400 hover:text-white transition-colors">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="material-icons text-primary">auto_awesome</span>
                        <h1 className="text-lg font-bold">AI 자막 분석</h1>
                    </div>
                    <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs font-bold rounded-full">LIVE DEMO</span>
                </div>
                <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 bg-primary text-black font-bold rounded-lg hover:scale-105 active:scale-95 transition-all text-sm"
                >
                    에디터에서 직접 해보기
                </button>
            </header>

            <div className="flex h-[calc(100vh-52px)]">
                {/* Left: Video Preview + Timeline */}
                <div className="flex-1 flex flex-col border-r border-white/10">
                    {/* Mock Video Preview */}
                    <div className="flex-1 flex items-center justify-center bg-[#0d0d14] relative">
                        <div className="w-full max-w-2xl aspect-video bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl relative overflow-hidden shadow-2xl mx-8">
                            {/* Mock video content */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center">
                                    <span className="material-icons text-6xl text-gray-600 mb-2 block">videocam</span>
                                    <p className="text-gray-500 text-sm">데모 영상 미리보기</p>
                                </div>
                            </div>
                            {/* Subtitle overlay */}
                            {selectedSub !== null && (
                                <div className="absolute bottom-8 left-0 right-0 text-center">
                                    <span
                                        className="px-4 py-2 rounded-lg text-lg font-bold inline-block transition-all"
                                        style={{
                                            fontFamily: DEMO_SUBTITLES[selectedSub].font,
                                            color: DEMO_SUBTITLES[selectedSub].color,
                                            backgroundColor: DEMO_SUBTITLES[selectedSub].bg,
                                        }}
                                    >
                                        {DEMO_SUBTITLES[selectedSub].text}
                                    </span>
                                </div>
                            )}
                            {/* AI Badge */}
                            <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2 py-1 bg-primary/20 backdrop-blur-sm rounded-full">
                                <span className="material-icons text-primary text-xs">auto_awesome</span>
                                <span className="text-primary text-xs font-bold">AI 분석 완료</span>
                            </div>
                        </div>
                    </div>

                    {/* Mock Timeline */}
                    <div className="h-32 bg-[#111118] border-t border-white/10 p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-gray-500 font-mono">00:00:00</span>
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-primary/60 rounded-full" style={{ width: '30%' }}></div>
                            </div>
                            <span className="text-xs text-gray-500 font-mono">00:00:20</span>
                        </div>
                        <div className="space-y-1.5">
                            {DEMO_SUBTITLES.map((sub, idx) => (
                                <div
                                    key={sub.id}
                                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-all text-xs ${selectedSub === idx ? 'bg-primary/20 border border-primary/40' : 'bg-white/5 hover:bg-white/10'
                                        }`}
                                    onClick={() => setSelectedSub(idx)}
                                >
                                    <span className="font-mono text-gray-500 w-16">{sub.start}</span>
                                    <div className="h-3 rounded-sm flex-1" style={{
                                        background: `linear-gradient(90deg, ${sub.color}40 0%, ${sub.color}20 100%)`,
                                        width: `${(parseInt(sub.end.split(':')[2]) - parseInt(sub.start.split(':')[2])) * 15}%`
                                    }}></div>
                                    <span className="text-gray-400 truncate max-w-[150px]">{sub.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: AI Analysis Panel */}
                <div className="w-[420px] bg-[#111118] overflow-y-auto">
                    {/* Analysis Header */}
                    <div className="p-4 border-b border-white/10">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-bold flex items-center gap-2">
                                <span className="material-icons text-primary text-sm">psychology</span>
                                AI 분석 결과
                            </h2>
                            <button
                                onClick={handleReAnalyze}
                                disabled={analyzing}
                                className="px-3 py-1 bg-white/5 text-xs rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                                {analyzing ? '분석 중...' : '재분석'}
                            </button>
                        </div>

                        {/* Mood & Genre */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/5 rounded-lg p-3">
                                <span className="text-gray-500 text-xs">영상 분위기</span>
                                <p className="font-bold text-sm mt-1">{AI_ANALYSIS.mood}</p>
                            </div>
                            <div className="bg-white/5 rounded-lg p-3">
                                <span className="text-gray-500 text-xs">콘텐츠 장르</span>
                                <p className="font-bold text-sm mt-1">{AI_ANALYSIS.genre}</p>
                            </div>
                        </div>
                    </div>

                    {/* Scores */}
                    <div className="p-4 border-b border-white/10">
                        <h3 className="text-sm font-bold mb-3 text-gray-400">AI 점수</h3>
                        {[
                            { label: '분위기 매칭', score: AI_ANALYSIS.moodScore, color: '#FFD700' },
                            { label: '가독성', score: AI_ANALYSIS.readability, color: '#00FF88' },
                            { label: '트렌드 일치', score: AI_ANALYSIS.trendMatch, color: '#6B8AFF' },
                        ].map((item) => (
                            <div key={item.label} className="mb-3">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-400">{item.label}</span>
                                    <span className="font-bold" style={{ color: item.color }}>{item.score}%</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000"
                                        style={{ width: analysisComplete ? `${item.score}%` : '0%', backgroundColor: item.color }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Recommended Styles */}
                    <div className="p-4 border-b border-white/10">
                        <h3 className="text-sm font-bold mb-3 text-gray-400">🎨 AI 추천 스타일</h3>
                        <div className="space-y-2">
                            <div className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <span className="text-xs text-gray-500">추천 폰트</span>
                                    <p className="font-bold text-sm" style={{ fontFamily: AI_ANALYSIS.recommendedFont }}>{AI_ANALYSIS.recommendedFont}</p>
                                </div>
                                <button className="px-2 py-1 text-primary text-xs border border-primary/30 rounded hover:bg-primary/10 transition-colors">적용</button>
                            </div>
                            <div className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <span className="text-xs text-gray-500">추천 색상</span>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="w-5 h-5 rounded-full border border-white/20" style={{ backgroundColor: AI_ANALYSIS.recommendedColor }}></div>
                                        <span className="text-sm font-mono">{AI_ANALYSIS.recommendedColor}</span>
                                    </div>
                                </div>
                                <button className="px-2 py-1 text-primary text-xs border border-primary/30 rounded hover:bg-primary/10 transition-colors">적용</button>
                            </div>
                        </div>
                    </div>

                    {/* Subtitle List */}
                    <div className="p-4">
                        <h3 className="text-sm font-bold mb-3 text-gray-400">📝 자막 목록 ({DEMO_SUBTITLES.length}개)</h3>
                        <div className="space-y-2">
                            {DEMO_SUBTITLES.map((sub, idx) => (
                                <div
                                    key={sub.id}
                                    className={`rounded-lg p-3 cursor-pointer transition-all ${selectedSub === idx ? 'bg-primary/15 border border-primary/30' : 'bg-white/5 hover:bg-white/10 border border-transparent'
                                        }`}
                                    onClick={() => setSelectedSub(idx)}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-xs text-gray-500">{sub.start} → {sub.end}</span>
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">{sub.confidence}%</span>
                                    </div>
                                    <p className="text-sm" style={{ fontFamily: sub.font, color: sub.color }}>{sub.text}</p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className="text-[10px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">{sub.font}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
