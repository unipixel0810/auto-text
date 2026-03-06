'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEMO_PROJECTS = [
    {
        id: 1,
        title: '혼자 떠나는 일본 여행 브이로그 Ep.3',
        thumbnail: '🗼',
        duration: '12:34',
        date: '2024-03-01',
        views: '15.2만',
        font: 'Noto Sans KR',
        color: '#FFFFFF',
        bg: '#000000CC',
        subtitleCount: 48,
        dnaScore: 95,
        tags: ['여행', '브이로그', '일본'],
    },
    {
        id: 2,
        title: '카페 창업 브이로그 - 첫 손님이 왔어요!',
        thumbnail: '☕',
        duration: '8:21',
        date: '2024-02-25',
        views: '8.7만',
        font: 'Black Han Sans',
        color: '#FFD700',
        bg: '#1A1A2ECC',
        subtitleCount: 32,
        dnaScore: 88,
        tags: ['창업', '카페', '일상'],
    },
    {
        id: 3,
        title: '오늘의 먹방: 전주 비빔밥 먹으러 가봤습니다',
        thumbnail: '🍚',
        duration: '10:05',
        date: '2024-02-20',
        views: '22.1만',
        font: 'Jua',
        color: '#FF6B9D',
        bg: '#0D1117CC',
        subtitleCount: 55,
        dnaScore: 92,
        tags: ['먹방', '전주', '맛집'],
    },
    {
        id: 4,
        title: '코딩 브이로그 - 웹사이트 만들기 도전',
        thumbnail: '💻',
        duration: '15:42',
        date: '2024-02-15',
        views: '5.3만',
        font: 'Do Hyeon',
        color: '#00BFFF',
        bg: '#111827CC',
        subtitleCount: 72,
        dnaScore: 85,
        tags: ['코딩', '개발', '도전'],
    },
    {
        id: 5,
        title: '운동 루틴 공유! 홈트 30분 완성',
        thumbnail: '💪',
        duration: '6:15',
        date: '2024-02-10',
        views: '11.8만',
        font: 'Nanum Gothic',
        color: '#88FF88',
        bg: '#0A0A0FCC',
        subtitleCount: 28,
        dnaScore: 78,
        tags: ['운동', '홈트', '건강'],
    },
];

const DNA_PROFILE = {
    overallScore: 91,
    totalProjects: 5,
    totalSubtitles: 235,
    preferredFont: 'Noto Sans KR',
    preferredColor: '#FFFFFF',
    avgDnaScore: 87.6,
    style: '깔끔한 미니멀 스타일',
    personality: '전문적이면서 친근한',
};

export default function DNAStylingPage() {
    const router = useRouter();
    const [selectedProject, setSelectedProject] = useState<number | null>(null);
    const [clonedProjects, setClonedProjects] = useState<number[]>([]);
    const [cloning, setCloning] = useState<number | null>(null);

    const handleClone = (projectId: number) => {
        setCloning(projectId);
        setTimeout(() => {
            setClonedProjects(prev => [...prev, projectId]);
            setCloning(null);
        }, 1500);
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
                        <span className="material-icons text-purple-400">fingerprint</span>
                        <h1 className="text-lg font-bold">DNA 스타일링</h1>
                    </div>
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-full">MY STYLE</span>
                </div>
                <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 bg-primary text-black font-bold rounded-lg hover:scale-105 active:scale-95 transition-all text-sm"
                >
                    에디터에서 직접 해보기
                </button>
            </header>

            <div className="flex h-[calc(100vh-52px)]">
                {/* Left: DNA Profile */}
                <div className="w-[300px] bg-[#111118] border-r border-white/10 overflow-y-auto p-4">
                    <h2 className="font-bold mb-4 flex items-center gap-2">
                        <span className="material-icons text-purple-400 text-sm">dna</span>
                        나의 편집 DNA
                    </h2>

                    {/* DNA Score Ring */}
                    <div className="bg-white/5 rounded-xl p-6 text-center mb-4">
                        <div className="w-28 h-28 rounded-full border-4 border-purple-500/30 flex items-center justify-center mx-auto mb-3 relative">
                            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 border-r-purple-500 animate-spin" style={{ animationDuration: '3s' }}></div>
                            <div className="text-center">
                                <span className="text-3xl font-extrabold text-purple-400">{DNA_PROFILE.overallScore}</span>
                                <span className="text-xs text-gray-500 block">DNA 점수</span>
                            </div>
                        </div>
                        <p className="font-bold text-sm">{DNA_PROFILE.style}</p>
                        <p className="text-xs text-gray-500 mt-1">{DNA_PROFILE.personality}</p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                            <p className="text-xl font-extrabold text-purple-400">{DNA_PROFILE.totalProjects}</p>
                            <span className="text-[10px] text-gray-500">총 프로젝트</span>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                            <p className="text-xl font-extrabold text-purple-400">{DNA_PROFILE.totalSubtitles}</p>
                            <span className="text-[10px] text-gray-500">총 자막 수</span>
                        </div>
                    </div>

                    {/* Preferred Style */}
                    <div className="bg-white/5 rounded-xl p-4 mb-4">
                        <p className="text-xs text-gray-500 mb-2">선호 스타일</p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">폰트</span>
                                <span className="text-xs font-bold">{DNA_PROFILE.preferredFont}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">색상</span>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DNA_PROFILE.preferredColor }}></div>
                                    <span className="text-xs font-mono">{DNA_PROFILE.preferredColor}</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">평균 DNA</span>
                                <span className="text-xs font-bold text-purple-400">{DNA_PROFILE.avgDnaScore}점</span>
                            </div>
                        </div>
                    </div>

                    {/* DNA Evolution Chart */}
                    <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-3">📈 DNA 성장 기록</p>
                        <div className="space-y-1.5">
                            {['1월', '2월', '3월'].map((month, idx) => (
                                <div key={month} className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 w-8">{month}</span>
                                    <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${60 + idx * 15}%`,
                                                background: `linear-gradient(90deg, #8B5CF6, #D946EF)`,
                                            }}
                                        ></div>
                                    </div>
                                    <span className="text-xs font-bold text-purple-400">{60 + idx * 15}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main: Project List */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold">내 프로젝트</h2>
                            <p className="text-sm text-gray-500 mt-1">각 프로젝트의 편집 DNA를 복제하여 새 프로젝트에 적용하세요</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="px-3 py-1.5 bg-white/5 text-xs rounded-lg hover:bg-white/10 transition-colors text-gray-400">
                                <span className="material-icons text-sm mr-1">sort</span>최신순
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {DEMO_PROJECTS.map((project) => (
                            <div
                                key={project.id}
                                onClick={() => setSelectedProject(selectedProject === project.id ? null : project.id)}
                                className={`bg-[#111118] border rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.005] ${selectedProject === project.id ? 'border-purple-500/50 shadow-lg shadow-purple-500/10' : 'border-white/10'
                                    }`}
                            >
                                <div className="flex items-center p-4 gap-4">
                                    {/* Thumbnail */}
                                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-900/50 to-indigo-900/50 flex items-center justify-center text-3xl flex-shrink-0 border border-white/5">
                                        {project.thumbnail}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold truncate">{project.title}</h3>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                            <span className="flex items-center gap-1"><span className="material-icons text-xs">schedule</span>{project.duration}</span>
                                            <span className="flex items-center gap-1"><span className="material-icons text-xs">visibility</span>{project.views}</span>
                                            <span className="flex items-center gap-1"><span className="material-icons text-xs">subtitles</span>{project.subtitleCount}개</span>
                                            <span>{project.date}</span>
                                        </div>
                                        <div className="flex gap-1.5 mt-2">
                                            {project.tags.map(tag => (
                                                <span key={tag} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded-full">#{tag}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* DNA Score */}
                                    <div className="text-center flex-shrink-0">
                                        <div className={`text-2xl font-extrabold ${project.dnaScore >= 90 ? 'text-purple-400' : project.dnaScore >= 80 ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {project.dnaScore}
                                        </div>
                                        <div className="text-[10px] text-gray-500">DNA 점수</div>
                                    </div>

                                    {/* Clone Button */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleClone(project.id); }}
                                        disabled={cloning === project.id || clonedProjects.includes(project.id)}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 ${clonedProjects.includes(project.id)
                                                ? 'bg-green-500/20 text-green-400 cursor-default'
                                                : cloning === project.id
                                                    ? 'bg-purple-500/20 text-purple-400 animate-pulse'
                                                    : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                                            }`}
                                    >
                                        <span className="material-icons text-sm">
                                            {clonedProjects.includes(project.id) ? 'check_circle' : cloning === project.id ? 'autorenew' : 'content_copy'}
                                        </span>
                                        {clonedProjects.includes(project.id) ? '복제 완료' : cloning === project.id ? 'DNA 복제 중...' : 'DNA 복제'}
                                    </button>
                                </div>

                                {/* Expanded Detail */}
                                {selectedProject === project.id && (
                                    <div className="px-4 pb-4 border-t border-white/5 pt-3">
                                        <div className="grid grid-cols-3 gap-3">
                                            {/* Style Preview */}
                                            <div className="bg-black/30 rounded-lg p-3">
                                                <p className="text-xs text-gray-500 mb-2">자막 스타일 미리보기</p>
                                                <div className="text-center py-3">
                                                    <span
                                                        className="px-3 py-1.5 rounded-lg text-sm font-bold inline-block"
                                                        style={{
                                                            fontFamily: project.font,
                                                            color: project.color,
                                                            backgroundColor: project.bg,
                                                        }}
                                                    >
                                                        이 프로젝트의 자막 스타일
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Font Info */}
                                            <div className="bg-black/30 rounded-lg p-3">
                                                <p className="text-xs text-gray-500 mb-2">스타일 정보</p>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-500">폰트</span>
                                                        <span className="font-bold">{project.font}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs items-center">
                                                        <span className="text-gray-500">색상</span>
                                                        <div className="flex items-center gap-1">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }}></div>
                                                            <span className="font-mono text-[10px]">{project.color}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-500">자막 수</span>
                                                        <span className="font-bold">{project.subtitleCount}개</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* DNA Analysis */}
                                            <div className="bg-black/30 rounded-lg p-3">
                                                <p className="text-xs text-gray-500 mb-2">DNA 분석</p>
                                                {[
                                                    { label: '일관성', value: project.dnaScore - 3 },
                                                    { label: '가독성', value: project.dnaScore + 2 },
                                                    { label: '트렌드', value: project.dnaScore - 5 },
                                                ].map(item => (
                                                    <div key={item.label} className="mb-1.5">
                                                        <div className="flex justify-between text-[10px] mb-0.5">
                                                            <span className="text-gray-500">{item.label}</span>
                                                            <span className="text-purple-400">{Math.min(item.value, 100)}%</span>
                                                        </div>
                                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${Math.min(item.value, 100)}%` }}></div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
