'use client';

import React, { useState, memo } from 'react';

export interface SegmentFilter {
  device_type?: string;
  browser?: string;
  os?: string;
  utm_source?: string;
  utm_medium?: string;
}

const DEVICE_OPTIONS = ['all', 'desktop', 'mobile', 'tablet'];
const BROWSER_OPTIONS = ['all', 'Chrome', 'Safari', 'Firefox', 'Edge'];
const OS_OPTIONS = ['all', 'Windows', 'macOS', 'iOS', 'Android', 'Linux'];

export const SegmentBuilder = memo(function SegmentBuilder({
  segment,
  onChange,
}: {
  segment: SegmentFilter;
  onChange: (segment: SegmentFilter) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const activeFilters = Object.entries(segment).filter(([, v]) => v && v !== 'all').length;

  const update = (key: keyof SegmentFilter, value: string) => {
    onChange({ ...segment, [key]: value === 'all' ? undefined : value });
  };

  const clearAll = () => onChange({});

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          activeFilters > 0
            ? 'bg-[#00D4D4]/20 text-[#00D4D4] border border-[#00D4D4]/30'
            : 'bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white'
        }`}
      >
        <span className="material-symbols-outlined text-[14px]">filter_alt</span>
        세그먼트{activeFilters > 0 && ` (${activeFilters})`}
      </button>

      {expanded && (
        <div className="absolute top-full right-0 mt-1 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 shadow-2xl z-50 w-64 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white">세그먼트 필터</span>
            {activeFilters > 0 && (
              <button onClick={clearAll} className="text-[10px] text-gray-500 hover:text-red-400">
                초기화
              </button>
            )}
          </div>

          <FilterSelect label="디바이스" value={segment.device_type || 'all'} options={DEVICE_OPTIONS} onChange={v => update('device_type', v)} />
          <FilterSelect label="브라우저" value={segment.browser || 'all'} options={BROWSER_OPTIONS} onChange={v => update('browser', v)} />
          <FilterSelect label="OS" value={segment.os || 'all'} options={OS_OPTIONS} onChange={v => update('os', v)} />

          <div>
            <label className="block text-[10px] text-gray-500 mb-1">UTM Source</label>
            <input
              value={segment.utm_source || ''}
              onChange={e => update('utm_source', e.target.value || 'all')}
              placeholder="예: google, youtube"
              className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">UTM Medium</label>
            <input
              value={segment.utm_medium || ''}
              onChange={e => update('utm_medium', e.target.value || 'all')}
              placeholder="예: cpc, organic"
              className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]"
            />
          </div>
        </div>
      )}
    </div>
  );
});

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00D4D4]"
      >
        {options.map(o => (
          <option key={o} value={o}>{o === 'all' ? '전체' : o}</option>
        ))}
      </select>
    </div>
  );
}
