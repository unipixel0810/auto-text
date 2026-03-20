'use client';

import React, { useState, useEffect } from 'react';
import { DATE_FILTERS } from '@/lib/analytics/types';
import {
  KPICard, ChartCard, CustomTooltip, EmptyState, LoadingSpinner,
  COLORS, formatNumber,
} from '@/components/analytics/shared';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, CartesianGrid, XAxis, YAxis,
  Tooltip as RechartsTooltip, Legend,
} from 'recharts';

const AGE_COLORS = ['#3B82F6', '#00D4D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const GENDER_COLORS = ['#3B82F6', '#EC4899', '#6B7280'];

export default function DemographicsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/query?action=demographics&days=${days}`);
        if (!res.ok) {
          console.error('Failed to fetch demographics:', res.status);
          setData(null);
          return;
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Failed to fetch demographics:', err);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days]);

  const ageGroups: { name: string; value: number }[] = data?.ageGroups || [
    { name: '18-24', value: 0 }, { name: '25-34', value: 0 },
    { name: '35-44', value: 0 }, { name: '45-54', value: 0 },
    { name: '55+', value: 0 },
  ];
  const genderData: { name: string; value: number }[] = data?.genders || [
    { name: '남성', value: 0 }, { name: '여성', value: 0 }, { name: '미확인', value: 0 },
  ];
  const languages: { name: string; value: number }[] = data?.languages || [];
  const resolutions: { name: string; value: number }[] = data?.screenResolutions || [];
  const browsers: { name: string; value: number }[] = data?.browsers || [];
  const osList: { name: string; value: number }[] = data?.operatingSystems || [];
  const connectionTypes: { name: string; value: number }[] = data?.connectionTypes || [];
  const touchPct: number = data?.touchSupport ?? 0;
  const cookiePct: number = data?.cookiesEnabled ?? 0;

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <header className="border-b border-[#1e1e2e] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0d0d14]/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/analytics" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">group</span>
          <h1 className="text-lg font-semibold">인구통계</h1>
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
        {loading ? <LoadingSpinner /> : (
          <div className="space-y-6">
            {/* Age + Gender pie charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="연령대 분포" icon="group">
                {ageGroups.some(a => a.value > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={ageGroups} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" label={(props) => `${props.name} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}>
                        {ageGroups.map((_, i) => <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon="group" message="연령대 데이터 없음" />}
              </ChartCard>

              <ChartCard title="성별 분포" icon="wc">
                {genderData.some(g => g.value > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={genderData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" label={(props) => `${props.name} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}>
                        {genderData.map((_, i) => <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon="wc" message="성별 데이터 없음" />}
              </ChartCard>
            </div>

            {/* Language + Screen resolutions bar charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="언어 분포" icon="translate">
                {languages.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={languages.slice(0, 8)} layout="vertical" margin={{ left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#aaa', fontSize: 11 }} width={55} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="사용자" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon="translate" message="언어 데이터 없음" />}
              </ChartCard>

              <ChartCard title="화면 해상도" icon="aspect_ratio">
                {resolutions.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={resolutions.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#aaa', fontSize: 11 }} width={75} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="사용자" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon="aspect_ratio" message="해상도 데이터 없음" />}
              </ChartCard>
            </div>

            {/* Browser + OS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="브라우저 분포" icon="public">
                {browsers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={browsers} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                        {browsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon="public" message="브라우저 데이터 없음" />}
              </ChartCard>

              <ChartCard title="운영체제 분포" icon="computer">
                {osList.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={osList} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                        {osList.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon="computer" message="OS 데이터 없음" />}
              </ChartCard>
            </div>

            {/* Connection type stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {connectionTypes.length > 0 && connectionTypes.map((ct, i) => (
                <KPICard key={i} title={`연결: ${ct.name}`} value={(ct.value ?? 0).toLocaleString()} icon="wifi" color={COLORS[i % COLORS.length]} />
              ))}
              <KPICard title="터치 지원" value={`${touchPct.toFixed(1)}%`} icon="touch_app" color="#EC4899" />
              <KPICard title="쿠키 허용" value={`${cookiePct.toFixed(1)}%`} icon="cookie" color="#10B981" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
