'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

const TREND_DATA = [
    {
        rank: 1,
        channel: '침착맨',
        subscribers: '342만',
        style: { font: 'Black Han Sans', color: '#FFD700', bg: '#000000' },
        trendScore: 98,
        category: '예능/토크',
        avgViews: '150만',
        subtitleStyle: '굵은 노란색 + 검정 배경',
    },
    {
        rank: 2,
        channel: '빠니보틀',
        subscribers: '280만',
        style: { font: 'Noto Sans KR', color: '#FFFFFF', bg: '#FF4444AA' },
        trendScore: 95,
        category: '여행/브이로그',
        avgViews: '120만',
        subtitleStyle: '깔끔한 흰색 + 빨간 강조',
    },
    {
        rank: 3,
        channel: '쯔양',
        subscribers: '598만',
        style: { font: 'Jua', color: '#FF6B9D', bg: '#1A1A2ECC' },
        trendScore: 93,
        category: '먹방/ASMR',
        avgViews: '200만',
        subtitleStyle: '귀여운 핑크 + 다크 배경',
    },
    {
        rank: 4,
        channel: '외국어 충전소',
        subscribers: '180만',
        style: { font: 'Do Hyeon', color: '#00BFFF', bg: '#111827CC' },
        trendScore: 90,
        category: '교육/학습',
        avgViews: '80만',
        subtitleStyle: '안정적 블루 + 모던 배경',
    },
    {
        rank: 5,
        channel: '드로우앤드류',
        subscribers: '120만',
        style: { font: 'Nanum Gothic', color: '#88FF88', bg: '#0D0D1ACC' },
        trendScore: 87,
        category: '일러스트/그림',
        avgViews: '45만',
        subtitleStyle: '자연스러운 그린 + 미니멀',
    },
];

const ALGORITHM_INSIGHTS = [
    { icon: 'visibility', label: '자막 있는 영상', value: '+38%', desc: '조회수 증가' },
    { icon: 'thumb_up', label: '트렌드 자막 적용', value: '+52%', desc: '좋아요 증가' },
    { icon: 'schedule', label: '평균 시청 시간', value: '+1분 24초', desc: '시청 유지율 향상' },
    { icon: 'group', label: '숏폼 자막 효과', value: '+67%', desc: '구독 전환율 증가' },
];

export default function AlgorithmTrendPage() {
    const router = useRouter();
    const [selectedTrend, setSelectedTrend] = useState<number>(0);
    const [activeCategory, setActiveCategory] = useState<string>('전체');

    const categories = ['전체', '예능/토크', '여행/브이로그', '먹방/ASMR', '교육/학습', '일러스트/그림'];

    const filteredData = activeCategory === '전체'
        ? TREND_DATA
        : TREND_DATA.filter(t => t.category === activeCategory);

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white font-display">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#111118]">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/landing')} className="text-gray-400 hover:text-white transition-colors">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="material-icons text-blue-400">trending_up</span>
                        <h1 className="text-lg font-bold">알고리즘 트렌드</h1>
                    </div>
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full">LIVE ANALYSIS</span>
                </div>
                <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 bg-primary text-black font-bold rounded-lg hover:scale-105 active:scale-95 transition-all text-sm"
                >
                    에디터에서 적용하기
                </button>
            </header>

            <div className="flex h-[calc(100vh-52px)]">
                {/* Main Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Algorithm Insights Cards */}
                    <div className="grid grid-cols-4 gap-4 mb-8">
                        {ALGORITHM_INSIGHTS.map((insight) => (
                            <div key={insight.label} className="bg-[#111118] border border-white/10 rounded-xl p-4 text-center hover:border-blue-500/30 transition-colors">
                                <span className="material-icons text-blue-400 text-2xl mb-2 block">{insight.icon}</span>
                                <p className="text-2xl font-extrabold text-white mb-1">{insight.value}</p>
                                <p className="text-xs text-gray-500">{insight.label}</p>
                                <p className="text-[10px] text-blue-400 mt-1">{insight.desc}</p>
                            </div>
                        ))}
                    </div>

                    {/* Category Filter */}
                    <div className="flex gap-2 mb-6 flex-wrap">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeCategory === cat
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Trend Rankings */}
                    <div className="space-y-3">
                        {filteredData.map((trend, idx) => (
                            <div
                                key={trend.rank}
                                onClick={() => setSelectedTrend(idx)}
                                className={`bg-[#111118] border rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.01] ${selectedTrend === idx ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : 'border-white/10'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    {/* Rank Badge */}
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg ${trend.rank <= 3 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-black' : 'bg-white/10 text-gray-400'
                                        }`}>
                                        {trend.rank}
                                    </div>

                                    {/* Channel Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-lg">{trend.channel}</h3>
                                            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{trend.category}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                            <span>구독자 {trend.subscribers}</span>
                                            <span>평균 조회수 {trend.avgViews}</span>
                                            <span>스타일: {trend.subtitleStyle}</span>
                                        </div>
                                    </div>

                                    {/* Trend Score */}
                                    <div className="text-right">
                                        <div className="text-2xl font-extrabold text-blue-400">{trend.trendScore}</div>
                                        <div className="text-[10px] text-gray-500">트렌드 점수</div>
                                    </div>

                                    {/* Apply Button */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); router.push('/'); }}
                                        className="px-4 py-2 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-500/30 transition-colors"
                                    >
                                        이 스타일 적용
                                    </button>
                                </div>

                                {/* Preview */}
                                {selectedTrend === idx && (
                                    <div className="mt-4 pt-4 border-t border-white/5">
                                        <p className="text-xs text-gray-500 mb-2">자막 미리보기</p>
                                        <div className="bg-black/50 rounded-lg p-4 text-center">
                                            <span
                                                className="px-4 py-2 rounded-lg text-xl font-bold inline-block"
                                                style={{
                                                    fontFamily: trend.style.font,
                                                    color: trend.style.color,
                                                    backgroundColor: trend.style.bg,
                                                }}
                                            >
                                                이것은 {trend.channel} 스타일의 자막입니다
                                            </span>
                                        </div>
                                        <div className="flex gap-3 mt-3">
                                            <div className="bg-white/5 rounded-lg px-3 py-2 text-xs">
                                                <span className="text-gray-500">폰트:</span> <span className="font-bold">{trend.style.font}</span>
                                            </div>
                                            <div className="bg-white/5 rounded-lg px-3 py-2 text-xs flex items-center gap-1.5">
                                                <span className="text-gray-500">색상:</span>
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: trend.style.color }}></div>
                                                <span className="font-mono">{trend.style.color}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Live Trend Chart */}
                <div className="w-[320px] bg-[#111118] border-l border-white/10 p-4 overflow-y-auto">
                    <h2 className="font-bold mb-4 flex items-center gap-2">
                        <span className="material-icons text-blue-400 text-sm">insights</span>
                        실시간 트렌드
                    </h2>

                    {/* Mock Chart */}
                    <div className="bg-white/5 rounded-xl p-4 mb-4">
                        <p className="text-xs text-gray-500 mb-3">이번 주 자막 트렌드 변화</p>
                        <div className="space-y-2">
                            {['굵은 폰트', '노란색 강조', '다크 배경', '움직이는 자막', '이모지 포함'].map((item, idx) => (
                                <div key={item} className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 w-20 truncate">{item}</span>
                                    <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-1000"
                                            style={{
                                                width: `${90 - idx * 12}%`,
                                                background: `linear-gradient(90deg, #3B82F6, #8B5CF6)`,
                                            }}
                                        ></div>
                                    </div>
                                    <span className="text-xs font-bold text-blue-400">{90 - idx * 12}%</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hot Keywords */}
                    <div className="bg-white/5 rounded-xl p-4 mb-4">
                        <p className="text-xs text-gray-500 mb-3">🔥 인기 키워드</p>
                        <div className="flex flex-wrap gap-1.5">
                            {['#숏폼자막', '#트렌디', '#유튜브편집', '#자동자막', '#AI편집', '#구독자늘리기', '#조회수폭발', '#편집꿀팁'].map((tag) => (
                                <span key={tag} className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">{tag}</span>
                            ))}
                        </div>
                    </div>

                    {/* Weekly Update */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-3">📊 주간 업데이트</p>
                        <div className="space-y-3">
                            {[
                                { text: '큰 글씨 자막 트렌드 +15%', time: '2시간 전' },
                                { text: '네온 컬러 자막 인기 상승', time: '5시간 전' },
                                { text: '미니멀 자막 스타일 유지', time: '1일 전' },
                            ].map((update) => (
                                <div key={update.text} className="flex items-start gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                                    <div>
                                        <p className="text-xs">{update.text}</p>
                                        <span className="text-[10px] text-gray-600">{update.time}</span>
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
