'use client';

import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  action: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  /** @deprecated Use items array instead */
  onDelete?: () => void;
}

export default function ContextMenu({ x, y, items, onClose, onDelete }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Legacy fallback: if items is empty but onDelete is provided
  const menuItems: ContextMenuItem[] = items.length > 0
    ? items
    : onDelete
      ? [{ label: '삭제', icon: 'delete', danger: true, action: onDelete }]
      : [];

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (menuItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed bg-[#1a1a1a] border border-[#333] rounded-lg shadow-2xl z-[9999] min-w-[160px] py-1"
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, i) => (
        <React.Fragment key={i}>
          {item.divider && i > 0 && <div className="h-px bg-[#333] my-1" />}
          <button
            onClick={() => { item.action(); onClose(); }}
            disabled={item.disabled}
            className={`w-full px-3 py-1.5 text-left text-[12px] flex items-center gap-2 transition-colors ${
              item.disabled
                ? 'text-gray-600 cursor-not-allowed'
                : item.danger
                  ? 'text-gray-300 hover:bg-red-600/20 hover:text-red-400'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.icon && (
              <span className="material-icons text-[14px] w-5 text-center">{item.icon}</span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <kbd className="text-[10px] text-gray-500 font-mono ml-4">{item.shortcut}</kbd>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
