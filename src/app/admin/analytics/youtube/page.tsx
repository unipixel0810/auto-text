'use client';

import React, { useState, useEffect } from 'react';
import { DATE_FILTERS } from '@/lib/analytics/types';
import {
  KPICard, ChartCard, CustomTooltip, LoadingSpinner,
  formatNumber,
} from '@/components/analytics/shared';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis,
  Tooltip as RechartsTooltip, Legend,
} from 'recharts';

interface YouTubeData {
  channel: { id: string; title: string; thumbnailUrl: string; subscriberCount: number; videoCount: number; viewCount: number; customUrl?: string } | null;
  recentVideos: { id: string; title: string; thumbnailUrl: string; publishedAt: string; viewCount: number; likeCount: number; commentCount: number; duration: string }[];
  analytics: { videoId: string; views: number; estimatedMinutesWatched: number; averageViewPercentage: number; subscribersGained: number; estimatedRevenue?: number }[];
  demographics: { ageGroup: string; gender: string; viewerPercentage: number }[];
  avgViewsPerVideo: number;
  avgEngagementRate: number;
  totalRevenue: number;
}

export default function YouTubePage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<YouTubeData | null>(null);
  const [searchFrame, setSearchFrame] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{ videoId: string; title: string; confidence: number } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/youtube?action=summary&days=${days}`)
      .then(r => {
        if (r.status === 403) throw new Error('NO_AUTH');
        if (!r.ok) throw new Error('API_ERROR');
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => {
        if (err.message === 'NO_AUTH') {
          setError('youtube_reauth');
        } else {
          // Demo data
          setData({
            channel: {
              id: 'demo', title: '내 채널', thumbnailUrl: '', subscriberCount: 1250, videoCount: 48, viewCount: 125000, customUrl: '@mychannel',
            },
            recentVideos: [
              { id: 'v1', title: '브이로그 편집 완성본', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(), viewCount: 3200, likeCount: 180, commentCount: 24, duration: 'PT12M30S' },
              { id: 'v2', title: '쇼츠 자동 자막 테스트', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(), viewCount: 8500, likeCount: 420, commentCount: 65, duration: 'PT0M58S' },
              { id: 'v3', title: '편집 강좌 #3 컷편집', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 8).toISOString(), viewCount: 1800, likeCount: 95, commentCount: 12, duration: 'PT8M15S' },
              { id: 'v4', title: '일상 브이로그 주말편', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 12).toISOString(), viewCount: 2100, likeCount: 130, commentCount: 18, duration: 'PT15M42S' },
              { id: 'v5', title: '음악 커버 영상', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 15).toISOString(), viewCount: 950, likeCount: 55, commentCount: 8, duration: 'PT4M20S' },
            ],
            analytics: [
              { videoId: 'v1', views: 3200, estimatedMinutesWatched: 12800, averageViewPercentage: 62, subscribersGained: 15, estimatedRevenue: 4.5 },
              { videoId: 'v2', views: 8500, estimatedMinutesWatched: 4250, averageViewPercentage: 85, subscribersGained: 45, estimatedRevenue: 12.3 },
              { videoId: 'v3', views: 1800, estimatedMinutesWatched: 7200, averageViewPercentage: 55, subscribersGained: 8, estimatedRevenue: 2.1 },
            ],
            demographics: [
              { ageGroup: 'age18-24', gender: 'male', viewerPercentage: 28 },
              { ageGroup: 'age18-24', gender: 'female', viewerPercentage: 18 },
              { ageGroup: 'age25-34', gender: 'male', viewerPercentage: 22 },
              { ageGroup: 'age25-34', gender: 'female', viewerPercentage: 15 },
              { ageGroup: 'age35-44', gender: 'male', viewerPercentage: 10 },
              { ageGroup: 'age35-44', gender: 'female', viewerPercentage: 7 },
            ],
            avgViewsPerVideo: 3310,
            avgEngagementRate: 4.2,
            totalRevenue: 18.9,
          });
        }
        setLoading(false);
      });
  }, [days]);

  const handleFrameSearch = async () => {
    if (!searchFrame) return;
    setSearching(true);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'find_by_frame', frameBase64: searchFrame }),
      });
      const d = await res.json();
      setSearchResult(d.result);
    } catch {
      setSearchResult(null);
    }
    setSearching(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setSearchFrame(base64);
    };
    reader.readAsDataURL(file);
  };

  const parseDuration = (iso: string) => {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '0:00';
    const h = parseInt(m[1] || '0');
    const min = parseInt(m[2] || '0');
    const s = parseInt(m[3] || '0');
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${min}:${String(s).padStart(2, '0')}`;
  };

  // Aggregate demographics for chart
  const demoChartData = (() => {
    if (!data) return [];
    const ageGroupMap: Record<string, { male: number; female: number }> = {};
    data.demographics.forEach(d => {
      const label = d.ageGroup.replace('age', '');
      if (!ageGroupMap[label]) ageGroupMap[label] = { male: 0, female: 0 };
      if (d.gender === 'male') ageGroupMap[label].male += d.viewerPercentage;
      else ageGroupMap[label].female += d.viewerPercentage;
    });
    return Object.entries(ageGroupMap).map(([name, v]) => ({ name, male: +v.male.toFixed(1), female: +v.female.toFixed(1) }));
  })();

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <header className="border-b border-[#1e1e2e] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0d0d14]/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/analytics" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#EF4444] text-[24px]">smart_display</span>
          <h1 className="text-lg font-semibold">YouTube 성과</h1>
        </div>
        <div className="flex items-center gap-2">
          {DATE_FILTERS.map(filter => (
            <button
              key={filter.days}
              onClick={() => setDays(filter.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                days === filter.days
                  ? 'bg-[#00D4D4] text-black'
                  : 'bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      <main className="p-6 max-w-[1400px] mx-auto">
        {loading ? <LoadingSpinner /> : error === 'youtube_reauth' ? (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="material-symbols-outlined text-[48px] text-red-400 mb-4">link_off</span>
            <h3 className="text-lg font-bold text-white mb-2">YouTube 연동이 필요합니다</h3>
            <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
              YouTube 데이터에 접근하려면 로그아웃 후 다시 로그인하여 YouTube 접근 권한을 승인해주세요.
            </p>
            <a href="/api/auth/signout" className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">
              다시 로그인하기
            </a>
          </div>
        ) : !data ? (
          <p className="text-gray-500 text-center py-10">데이터 없음</p>
        ) : (
          <div className="space-y-6">
            {/* Channel Overview */}
            {data.channel && (
              <div className="bg-gradient-to-r from-red-500/10 via-[#12121a] to-[#12121a] border border-red-500/20 rounded-xl p-5">
                <div className="flex items-center gap-4">
                  {data.channel.thumbnailUrl ? (
                    <img src={data.channel.thumbnailUrl} alt="" className="w-14 h-14 rounded-full" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-red-400 text-[28px]">smart_display</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white">{data.channel.title}</h3>
                    {data.channel.customUrl && <p className="text-xs text-gray-400">{data.channel.customUrl}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-6 text-center">
                    <div>
                      <p className="text-xl font-black text-white">{formatNumber(data.channel.subscriberCount)}</p>
                      <p className="text-[10px] text-gray-500">구독자</p>
                    </div>
                    <div>
                      <p className="text-xl font-black text-white">{formatNumber(data.channel.videoCount)}</p>
                      <p className="text-[10px] text-gray-500">동영상</p>
                    </div>
                    <div>
                      <p className="text-xl font-black text-white">{formatNumber(data.channel.viewCount)}</p>
                      <p className="text-[10px] text-gray-500">총 조회수</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-4 gap-4">
              <KPICard title="평균 조회수/영상" value={formatNumber(data.avgViewsPerVideo)} icon="visibility" color="#EF4444" />
              <KPICard title="참여율" value={`${data.avgEngagementRate}%`} icon="thumb_up" color="#F59E0B" subtitle="좋아요+댓글/조회수" />
              <KPICard title="추정 수익 (30일)" value={`$${data.totalRevenue.toFixed(2)}`} icon="payments" color="#10B981" />
              <KPICard title="영상 수" value={formatNumber(data.recentVideos.length)} icon="movie" color="#3B82F6" subtitle="최근 업로드" />
            </div>

            {/* Video List + Analytics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <ChartCard title="최근 영상 성과" icon="trending_up">
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {data.recentVideos.map((video, i) => {
                      const a = data.analytics.find(an => an.videoId === video.id);
                      return (
                        <div key={video.id} className="flex items-center gap-3 p-3 bg-[#0d0d14] rounded-lg hover:bg-[#161625] transition-colors">
                          <span className="text-xs text-gray-500 w-5 text-center font-mono">{i + 1}</span>
                          {video.thumbnailUrl ? (
                            <img src={video.thumbnailUrl} alt="" className="w-24 h-14 rounded object-cover bg-gray-800" />
                          ) : (
                            <div className="w-24 h-14 rounded bg-gray-800 flex items-center justify-center">
                              <span className="material-symbols-outlined text-gray-600">movie</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{video.title}</p>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                              <span>{new Date(video.publishedAt).toLocaleDateString('ko-KR')}</span>
                              <span>{parseDuration(video.duration)}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-right text-xs">
                            <div>
                              <p className="font-medium text-white">{formatNumber(video.viewCount)}</p>
                              <p className="text-[9px] text-gray-500">조회수</p>
                            </div>
                            <div>
                              <p className="font-medium text-white">{formatNumber(video.likeCount)}</p>
                              <p className="text-[9px] text-gray-500">좋아요</p>
                            </div>
                            <div>
                              <p className="font-medium text-white">{a ? `${a.averageViewPercentage}%` : '-'}</p>
                              <p className="text-[9px] text-gray-500">시청유지</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ChartCard>
              </div>

              {/* Demographics */}
              <ChartCard title="시청자 인구통계" icon="group">
                {demoChartData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={demoChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                        <XAxis dataKey="name" tick={{ fill: '#999', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#666', fontSize: 9 }} unit="%" />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="male" name="남성" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="female" name="여성" fill="#EC4899" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 text-center py-8">인구통계 데이터 없음</p>
                )}
              </ChartCard>
            </div>

            {/* AI Video Matching (Gemini Vision) */}
            <ChartCard title="AI 영상 매칭 (Gemini Vision)" icon="image_search"
              rightContent={<span className="text-[10px] text-gray-500">편집 영상의 프레임을 분석하여 YouTube 원본 영상을 자동으로 찾습니다</span>}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-2">영상 프레임 이미지 업로드</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-2 bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2a2a3e] rounded-lg text-sm text-white transition-colors">
                      <span className="material-symbols-outlined text-[16px] mr-1 align-middle">upload_file</span>
                      이미지 선택
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                    </label>
                    <button
                      onClick={handleFrameSearch}
                      disabled={!searchFrame || searching}
                      className="px-4 py-2 bg-[#00D4D4] hover:bg-[#00B8B8] disabled:bg-gray-700 disabled:text-gray-500 text-black rounded-lg text-sm font-medium transition-colors"
                    >
                      {searching ? (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                          분석 중...
                        </span>
                      ) : 'YouTube에서 찾기'}
                    </button>
                  </div>
                  {searchFrame && (
                    <div className="mt-3 flex items-start gap-3">
                      <img src={`data:image/jpeg;base64,${searchFrame}`} alt="프레임" className="w-40 h-24 rounded object-cover border border-[#2a2a3e]" />
                      {searchResult && (
                        <div className="bg-[#0d0d14] rounded-lg p-3 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-green-400 text-[16px]">check_circle</span>
                            <p className="text-sm font-medium text-white">매칭 결과</p>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              searchResult.confidence >= 0.7 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              신뢰도 {Math.round(searchResult.confidence * 100)}%
                            </span>
                          </div>
                          <p className="text-xs text-gray-300">{searchResult.title}</p>
                          <a
                            href={`https://youtube.com/watch?v=${searchResult.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#00D4D4] hover:underline mt-1 inline-block"
                          >
                            YouTube에서 보기 →
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ChartCard>

            {/* Cross-analysis hint */}
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[#8B5CF6] text-[20px]">auto_awesome</span>
                <h3 className="text-sm font-bold text-white">편집 ↔ YouTube 교차 분석</h3>
                <span className="px-2 py-0.5 bg-[#8B5CF6]/15 text-[#8B5CF6] text-[9px] font-bold rounded-full">COMING SOON</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#0d0d14] rounded-lg p-4">
                  <span className="material-symbols-outlined text-[#3B82F6] text-[24px] mb-2">analytics</span>
                  <h4 className="text-xs font-medium text-white mb-1">컷 편집 → 조회수</h4>
                  <p className="text-[10px] text-gray-500">컷 편집 스타일별 조회수 변화를 분석합니다. 어떤 편집 패턴이 성과가 높은지 자동으로 파악합니다.</p>
                </div>
                <div className="bg-[#0d0d14] rounded-lg p-4">
                  <span className="material-symbols-outlined text-[#EC4899] text-[24px] mb-2">subtitles</span>
                  <h4 className="text-xs font-medium text-white mb-1">자막 스타일 → 시청유지</h4>
                  <p className="text-[10px] text-gray-500">자막 디자인/빈도가 시청자 유지율에 미치는 영향을 분석합니다.</p>
                </div>
                <div className="bg-[#0d0d14] rounded-lg p-4">
                  <span className="material-symbols-outlined text-[#F59E0B] text-[24px] mb-2">monetization_on</span>
                  <h4 className="text-xs font-medium text-white mb-1">편집 시간 → 수익</h4>
                  <p className="text-[10px] text-gray-500">편집 노동 시간 대비 YouTube 수익률을 계산하여 최적의 편집 전략을 추천합니다.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
