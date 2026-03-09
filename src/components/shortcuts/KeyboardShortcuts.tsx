'use client';

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

export interface ShortcutAction {
    id: string;
    label: string;
    category: string;
    keys: string[];
    description?: string;
}

// CapCut-compatible default shortcuts
const DEFAULT_SHORTCUTS: ShortcutAction[] = [
    // General
    { id: 'undo', label: '실행 취소', category: '일반', keys: ['⌘', 'Z'], description: '마지막 작업을 취소합니다' },
    { id: 'redo', label: '다시 실행', category: '일반', keys: ['⌘', '⇧', 'Z'], description: '취소한 작업을 다시 실행합니다' },
    { id: 'save', label: '저장', category: '일반', keys: ['⌘', 'S'], description: '프로젝트를 저장합니다' },
    { id: 'import', label: '가져오기', category: '일반', keys: ['⌘', 'I'], description: '미디어 파일을 가져옵니다' },
    { id: 'export', label: '내보내기', category: '일반', keys: ['⌘', 'E'], description: '프로젝트를 내보냅니다' },
    { id: 'selectAll', label: '전체 선택', category: '일반', keys: ['⌘', 'A'], description: '모든 클립을 선택합니다' },
    { id: 'deselect', label: '선택 해제', category: '일반', keys: ['Esc'], description: '선택을 해제합니다' },
    { id: 'delete', label: '삭제', category: '일반', keys: ['⌫'], description: '선택한 클립을 삭제합니다' },

    // Playback
    { id: 'playPause', label: '재생/일시정지', category: '재생', keys: ['Space'], description: '재생을 시작하거나 일시정지합니다' },
    { id: 'frameForward', label: '다음 프레임', category: '재생', keys: ['.'], description: '한 프레임 앞으로 이동합니다' },
    { id: 'frameBackward', label: '이전 프레임', category: '재생', keys: [','], description: '한 프레임 뒤로 이동합니다' },
    { id: 'goToStart', label: '처음으로', category: '재생', keys: ['Home'], description: '타임라인의 처음으로 이동합니다' },
    { id: 'goToEnd', label: '끝으로', category: '재생', keys: ['End'], description: '타임라인의 끝으로 이동합니다' },
    { id: 'speedUp', label: '속도 높이기', category: '재생', keys: ['L'], description: '재생 속도를 높입니다' },
    { id: 'speedDown', label: '속도 낮추기', category: '재생', keys: ['J'], description: '재생 속도를 낮춥니다' },

    // Editing
    { id: 'split', label: '분할', category: '편집', keys: ['⌘', 'B'], description: '재생헤드 위치에서 클립을 분할합니다' },
    { id: 'copy', label: '복사', category: '편집', keys: ['⌘', 'C'], description: '선택한 클립을 복사합니다' },
    { id: 'paste', label: '붙여넣기', category: '편집', keys: ['⌘', 'V'], description: '클립을 붙여넣습니다' },
    { id: 'duplicate', label: '복제', category: '편집', keys: ['⌘', 'D'], description: '선택한 클립을 복제합니다' },
    { id: 'trimLeft', label: '왼쪽 트림', category: '편집', keys: ['Q'], description: '재생헤드 기준 왼쪽을 트림합니다' },
    { id: 'trimRight', label: '오른쪽 트림', category: '편집', keys: ['W'], description: '재생헤드 기준 오른쪽을 트림합니다' },
    { id: 'toggleEnable', label: '활성화/비활성화', category: '편집', keys: ['V'], description: '선택한 클립을 켜거나 끕니다' },

    // Timeline
    { id: 'zoomIn', label: '타임라인 확대', category: '타임라인', keys: ['⌘', '='], description: '타임라인을 확대합니다' },
    { id: 'zoomOut', label: '타임라인 축소', category: '타임라인', keys: ['⌘', '-'], description: '타임라인을 축소합니다' },
    { id: 'fitToScreen', label: '화면에 맞추기', category: '타임라인', keys: ['⌘', '⇧', 'F'], description: '타임라인을 화면에 맞춥니다' },
    { id: 'snapToggle', label: '스냅 토글', category: '타임라인', keys: ['N'], description: '자석 기능을 켜거나 끕니다' },

    // Viewer
    { id: 'viewerFit', label: '뷰어 화면 맞추기', category: '뷰어', keys: ['⇧', 'Z'], description: '뷰어를 원래 크기(100%)로 맞춥니다' },
    { id: 'viewerZoomIn', label: '뷰어 확대', category: '뷰어', keys: ['⌥', '='], description: '뷰어를 확대합니다' },
    { id: 'viewerZoomOut', label: '뷰어 축소', category: '뷰어', keys: ['⌥', '-'], description: '뷰어를 축소합니다' },

    // Position
    { id: 'nudgeLeft', label: '왼쪽으로 이동', category: '위치', keys: ['←'], description: '선택한 클립을 왼쪽으로 이동합니다' },
    { id: 'nudgeRight', label: '오른쪽으로 이동', category: '위치', keys: ['→'], description: '선택한 클립을 오른쪽으로 이동합니다' },
    { id: 'nudgeUp', label: '위로 이동', category: '위치', keys: ['↑'], description: '선택한 클립을 위로 이동합니다' },
    { id: 'nudgeDown', label: '아래로 이동', category: '위치', keys: ['↓'], description: '선택한 클립을 아래로 이동합니다' },
];

const STORAGE_KEY = 'autotext_keyboard_shortcuts';

function loadShortcuts(): ShortcutAction[] {
    if (typeof window === 'undefined') return DEFAULT_SHORTCUTS;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch { }
    return DEFAULT_SHORTCUTS;
}

function saveShortcuts(shortcuts: ShortcutAction[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
    } catch { }
}

interface ShortcutsContextType {
    shortcuts: ShortcutAction[];
    updateShortcut: (id: string, newKeys: string[]) => void;
    resetShortcuts: () => void;
    getShortcut: (id: string) => ShortcutAction | undefined;
}

const ShortcutsContext = createContext<ShortcutsContextType>({
    shortcuts: DEFAULT_SHORTCUTS,
    updateShortcut: () => { },
    resetShortcuts: () => { },
    getShortcut: () => undefined,
});

export function useShortcuts() {
    return useContext(ShortcutsContext);
}

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
    const [shortcuts, setShortcuts] = useState<ShortcutAction[]>(DEFAULT_SHORTCUTS);

    useEffect(() => {
        setShortcuts(loadShortcuts());
    }, []);

    const updateShortcut = useCallback((id: string, newKeys: string[]) => {
        setShortcuts(prev => {
            const updated = prev.map(s => s.id === id ? { ...s, keys: newKeys } : s);
            saveShortcuts(updated);
            return updated;
        });
    }, []);

    const resetShortcuts = useCallback(() => {
        setShortcuts(DEFAULT_SHORTCUTS);
        saveShortcuts(DEFAULT_SHORTCUTS);
    }, []);

    const getShortcut = useCallback((id: string) => {
        return shortcuts.find(s => s.id === id);
    }, [shortcuts]);

    return (
        <ShortcutsContext.Provider value={{ shortcuts, updateShortcut, resetShortcuts, getShortcut }}>
            {children}
        </ShortcutsContext.Provider>
    );
}

// === Keyboard Shortcut Settings Modal ===
interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
    const { shortcuts, updateShortcut, resetShortcuts } = useShortcuts();
    const [searchQuery, setSearchQuery] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
    const [activeCategory, setActiveCategory] = useState('전체');

    const categories = ['전체', ...Array.from(new Set(shortcuts.map(s => s.category)))];

    const filteredShortcuts = shortcuts.filter(s => {
        const matchCategory = activeCategory === '전체' || s.category === activeCategory;
        const matchSearch = searchQuery === '' ||
            s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCategory && matchSearch;
    });

    // Record key presses when editing a shortcut
    useEffect(() => {
        if (!editingId) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const keys: string[] = [];
            if (e.metaKey || e.ctrlKey) keys.push('⌘');
            if (e.shiftKey) keys.push('⇧');
            if (e.altKey) keys.push('⌥');

            const keyMap: Record<string, string> = {
                'Backspace': '⌫', 'Delete': '⌫', 'Enter': '↵', 'Escape': 'Esc',
                'ArrowLeft': '←', 'ArrowRight': '→', 'ArrowUp': '↑', 'ArrowDown': '↓',
                ' ': 'Space', 'Tab': 'Tab', 'Home': 'Home', 'End': 'End',
            };

            const key = e.key;
            if (!['Meta', 'Control', 'Shift', 'Alt'].includes(key)) {
                const displayKey = keyMap[key] || key.toUpperCase();
                keys.push(displayKey);
            }

            if (keys.length > 0 && !keys.every(k => ['⌘', '⇧', '⌥'].includes(k))) {
                setRecordedKeys(keys);
            }
        };

        const handleKeyUp = () => {
            if (recordedKeys.length > 0 && editingId) {
                updateShortcut(editingId, recordedKeys);
                setEditingId(null);
                setRecordedKeys([]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [editingId, recordedKeys, updateShortcut]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-[700px] max-h-[80vh] bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <span className="material-icons text-primary text-xl">keyboard</span>
                        <h2 className="text-lg font-bold">단축키 설정</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={resetShortcuts}
                            className="px-3 py-1.5 text-xs text-gray-400 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            기본값으로 초기화
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <span className="material-icons text-gray-400">close</span>
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="px-6 py-3 border-b border-white/5">
                    <div className="relative">
                        <span className="material-icons text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 text-sm">search</span>
                        <input
                            type="text"
                            placeholder="단축키 검색..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50"
                        />
                    </div>
                </div>

                {/* Category Tabs */}
                <div className="px-6 py-2 border-b border-white/5 flex gap-1.5 flex-wrap">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${activeCategory === cat
                                ? 'bg-primary text-black'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Shortcuts List */}
                <div className="flex-1 overflow-y-auto px-6 py-2">
                    {filteredShortcuts.map(shortcut => (
                        <div
                            key={shortcut.id}
                            className={`flex items-center justify-between py-3 border-b border-white/5 last:border-b-0 group hover:bg-white/[0.02] px-2 -mx-2 rounded ${editingId === shortcut.id ? 'bg-primary/10' : ''
                                }`}
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{shortcut.label}</span>
                                    <span className="text-[10px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">{shortcut.category}</span>
                                </div>
                                {shortcut.description && (
                                    <p className="text-xs text-gray-500 mt-0.5">{shortcut.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {editingId === shortcut.id ? (
                                    <div className="flex items-center gap-1 px-3 py-1.5 bg-primary/20 border border-primary/40 rounded-lg animate-pulse">
                                        {recordedKeys.length > 0 ? (
                                            recordedKeys.map((key, idx) => (
                                                <React.Fragment key={idx}>
                                                    {idx > 0 && <span className="text-gray-600 text-xs">+</span>}
                                                    <kbd className="bg-primary/30 text-primary px-2 py-0.5 rounded text-xs font-mono min-w-[24px] text-center">
                                                        {key}
                                                    </kbd>
                                                </React.Fragment>
                                            ))
                                        ) : (
                                            <span className="text-primary text-xs">키를 눌러주세요...</span>
                                        )}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { setEditingId(shortcut.id); setRecordedKeys([]); }}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group-hover:border-primary/30 border border-transparent"
                                    >
                                        {shortcut.keys.map((key, idx) => (
                                            <React.Fragment key={idx}>
                                                {idx > 0 && <span className="text-gray-600 text-xs">+</span>}
                                                <kbd className="bg-white/10 text-gray-300 px-2 py-0.5 rounded text-xs font-mono min-w-[24px] text-center shadow-sm">
                                                    {key}
                                                </kbd>
                                            </React.Fragment>
                                        ))}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02]">
                    <p className="text-xs text-gray-500 text-center">클릭하여 단축키를 변경하세요. 새 키 조합을 누르면 자동으로 저장됩니다.</p>
                </div>
            </div>
        </div>
    );
}

export { DEFAULT_SHORTCUTS };
