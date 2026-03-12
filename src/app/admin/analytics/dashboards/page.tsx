'use client';

import React, { useState, useCallback } from 'react';
import { LoadingSpinner, EmptyState } from '@/components/analytics/shared';

interface Widget {
  id: string;
  type: 'kpi' | 'chart' | 'retention' | 'funnel';
  title: string;
  config: { action: string; metric?: string; days?: number };
}

const WIDGET_PRESETS: { type: Widget['type']; title: string; config: Widget['config']; icon: string }[] = [
  { type: 'kpi', title: '오늘 방문자', config: { action: 'stats', metric: 'today_visitors' }, icon: 'people' },
  { type: 'kpi', title: '이탈률', config: { action: 'stats', metric: 'bounce_rate' }, icon: 'exit_to_app' },
  { type: 'kpi', title: '평균 체류시간', config: { action: 'stats', metric: 'avg_duration' }, icon: 'schedule' },
  { type: 'chart', title: '일별 방문자', config: { action: 'charts', metric: 'daily', days: 30 }, icon: 'trending_up' },
  { type: 'chart', title: '디바이스 분포', config: { action: 'charts', metric: 'devices' }, icon: 'devices' },
  { type: 'retention', title: '주간 리텐션', config: { action: 'retention', days: 90 }, icon: 'event_repeat' },
  { type: 'funnel', title: '가입 퍼널', config: { action: 'funnels' }, icon: 'filter_alt' },
];

interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
}

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([
    { id: 'default', name: '기본 대시보드', widgets: [] },
  ]);
  const [activeDashboard, setActiveDashboard] = useState('default');
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [newDashName, setNewDashName] = useState('');

  const currentDash = dashboards.find(d => d.id === activeDashboard) || dashboards[0];

  const addWidget = useCallback((preset: typeof WIDGET_PRESETS[0]) => {
    setDashboards(prev => prev.map(d => {
      if (d.id !== activeDashboard) return d;
      return {
        ...d,
        widgets: [...d.widgets, {
          id: `w_${Date.now()}`,
          type: preset.type,
          title: preset.title,
          config: preset.config,
        }],
      };
    }));
    setShowAddWidget(false);
  }, [activeDashboard]);

  const removeWidget = useCallback((widgetId: string) => {
    setDashboards(prev => prev.map(d => {
      if (d.id !== activeDashboard) return d;
      return { ...d, widgets: d.widgets.filter(w => w.id !== widgetId) };
    }));
  }, [activeDashboard]);

  const addDashboard = useCallback(() => {
    if (!newDashName.trim()) return;
    const id = `dash_${Date.now()}`;
    setDashboards(prev => [...prev, { id, name: newDashName.trim(), widgets: [] }]);
    setActiveDashboard(id);
    setNewDashName('');
  }, [newDashName]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00D4D4] text-[22px]">space_dashboard</span>
          <h1 className="text-lg font-semibold">커스텀 대시보드</h1>
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#00D4D4]/20 text-[#00D4D4] font-bold ml-2">BETA</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Dashboard tabs */}
          {dashboards.map(d => (
            <button
              key={d.id}
              onClick={() => setActiveDashboard(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeDashboard === d.id
                  ? 'bg-[#00D4D4] text-black'
                  : 'bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white'
              }`}
            >
              {d.name}
            </button>
          ))}
          {/* New dashboard */}
          <div className="flex items-center gap-1">
            <input
              value={newDashName}
              onChange={e => setNewDashName(e.target.value)}
              placeholder="새 대시보드"
              className="w-24 bg-[#12121a] border border-[#1e1e2e] rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]"
              onKeyDown={e => e.key === 'Enter' && addDashboard()}
            />
            <button onClick={addDashboard} className="p-1.5 rounded-lg bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-[#00D4D4] transition-colors">
              <span className="material-symbols-outlined text-[14px]">add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Widget grid */}
      {currentDash.widgets.length === 0 ? (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-[48px] text-gray-600 mb-4 block">widgets</span>
          <p className="text-sm text-gray-500 mb-4">위젯을 추가하여 대시보드를 구성하세요</p>
          <button
            onClick={() => setShowAddWidget(true)}
            className="px-4 py-2 rounded-lg bg-[#00D4D4] text-black text-sm font-medium hover:bg-[#00D4D4]/80 transition-colors"
          >
            위젯 추가
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {currentDash.widgets.map(widget => (
              <div key={widget.id} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 relative group">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">{widget.title}</h3>
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <div className="text-center py-8 text-gray-600">
                  <span className="material-symbols-outlined text-[28px] mb-2 block">
                    {WIDGET_PRESETS.find(p => p.title === widget.title)?.icon || 'widgets'}
                  </span>
                  <p className="text-[10px]">{widget.type} · {widget.config.action}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowAddWidget(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#12121a] border border-dashed border-[#2a2a3e] text-gray-500 hover:text-[#00D4D4] hover:border-[#00D4D4]/30 transition-all text-xs"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            위젯 추가
          </button>
        </>
      )}

      {/* Add widget modal */}
      {showAddWidget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowAddWidget(false)}>
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-6 w-[400px] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">위젯 추가</h2>
              <button onClick={() => setShowAddWidget(false)} className="text-gray-500 hover:text-white">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="space-y-2">
              {WIDGET_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => addWidget(preset)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-[#0d0d14] border border-[#1e1e2e] hover:border-[#00D4D4]/30 transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#00D4D4]">{preset.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{preset.title}</p>
                    <p className="text-[10px] text-gray-500">{preset.type}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
