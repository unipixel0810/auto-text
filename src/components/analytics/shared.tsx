'use client';

import React, { memo } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────
export const COLORS = ['#00D4D4', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];

// ─── Helpers ─────────────────────────────────────────────────────────────
export const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${s}초`;
};

export const formatNumber = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

export const safePercent = (part: number, total: number) =>
  total === 0 ? 0 : Math.round((part / total) * 1000) / 10;

// ─── Shared sub-components ──────────────────────────────────────────────
export const KPICard = memo(function KPICard({
  title, value, change, icon, color, subtitle,
}: {
  title: string; value: string; change?: number | null; icon: string; color: string; subtitle?: string;
}) {
  return (
    <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#2a2a3e] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{title}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <span className="material-symbols-outlined text-[18px]" style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-black text-white mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {change !== undefined && change !== null && (
          <span className={`text-xs font-bold flex items-center gap-0.5 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className="material-symbols-outlined text-[14px]">{change >= 0 ? 'trending_up' : 'trending_down'}</span>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
        {subtitle && <span className="text-[11px] text-gray-600">{subtitle}</span>}
      </div>
    </div>
  );
});

export const ChartCard = memo(function ChartCard({
  title, icon, children, className, rightContent,
}: {
  title: string; icon: string; children: React.ReactNode; className?: string; rightContent?: React.ReactNode;
}) {
  return (
    <div className={`bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 ${className || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#00D4D4]">{icon}</span>
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        {rightContent}
      </div>
      {children}
    </div>
  );
});

export const CustomTooltip = memo(function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-2xl">
      {label && <p className="text-[10px] text-gray-500 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-bold" style={{ color: p.color || '#fff' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
});

export const EmptyState = memo(function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="text-center py-20 text-gray-500">
      <span className="material-symbols-outlined text-[48px] mb-4 block">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
});

export const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="material-symbols-outlined text-[48px] text-[#00D4D4] animate-spin">refresh</span>
    </div>
  );
});
