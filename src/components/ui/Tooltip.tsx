'use client';

import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
  delay?: number;
}

export default function Tooltip({ label, shortcut, children, delay = 300 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div className="relative inline-flex" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[60] pointer-events-none flex flex-col items-center">
          {/* Tooltip body */}
          <div
            className="px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap flex items-center gap-2"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
          >
            <span className="text-[11px] text-white font-medium leading-none">{label}</span>
            {shortcut && (
              <kbd className="text-[10px] text-gray-400 bg-[#2a2a2a] border border-[#444] rounded px-1.5 py-0.5 font-mono leading-none">{shortcut}</kbd>
            )}
          </div>
          {/* Arrow pointing down */}
          <div
            className="w-0 h-0"
            style={{
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid #1a1a1a',
            }}
          />
        </div>
      )}
    </div>
  );
}
