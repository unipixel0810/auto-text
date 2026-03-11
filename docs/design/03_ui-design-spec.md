# 🎨 UI Designer 스탬프
> **Role**: UI Designer | **Date**: 2026-03-11 | **Ref**: UX #02

---

## 🖼️ 컴포넌트 와이어프레임 (ASCII)

### SubtitleAnimationPanel — 우측 사이드바 탭

```
┌─────────────────────────────────────┐
│ [스타일] [애니메이션] [위치]          │  ← 탭 네비게이션
├─────────────────────────────────────┤
│                                     │
│  🎬 등장 (IN)                        │
│ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │ ✓ 없음  │ │페이드인 │ │슬라이드↑│   │
│ │        │ │  0.3s  │ │  0.3s  │   │
│ └────────┘ └────────┘ └────────┘   │
│ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │슬라이드↓│ │  팝!   │ │타이핑.. │   │
│ │  🔒PRO  │ │  🔒PRO  │ │  🔒PRO  │   │
│ └────────┘ └────────┘ └────────┘   │
│                                     │
│  ──── 지속 시간 ────                  │
│  ◄━━━━━●━━━━━━━━━━► 0.3s            │
│   0.1s            1.0s              │
│                                     │
│  ✨ 퇴장 (OUT)                       │
│ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │ ✓ 없음  │ │페이드아웃│ │ 쉐이크 │   │
│ │        │ │  0.3s  │ │  🔒PRO  │   │
│ └────────┘ └────────┘ └────────┘   │
│                                     │
│  ⚡ 프리미엄으로 모든 효과 사용하기   │  ← CTA (PRO 미구독 시)
└─────────────────────────────────────┘
```

### AnimationPresetCard 상태별 디자인

```
[ 기본 상태 ]          [ 선택 상태 ]         [ PRO 잠금 상태 ]
┌──────────┐          ┌──────────┐          ┌──────────┐
│          │          │          │          │░░░░░░░░░░│
│  🌊 아이콘  │          │  🌊 아이콘  │          │  🔒      │
│          │          │          │          │░░░░░░░░░░│
│ 슬라이드 업 │          │ 슬라이드 업 │          │ 바운스   │
│   0.3s   │          │   0.3s   │          │  PRO     │
└──────────┘          └──────────┘          └──────────┘
border: white/10      border: #4488FF       opacity: 60%
                      bg: blue/10           🔒 오버레이
```

---

## 🎨 디자인 토큰

### 색상
```css
/* 기존 시스템과 일치 */
--animation-card-bg: rgba(255,255,255,0.05);
--animation-card-hover: rgba(255,255,255,0.08);
--animation-card-selected-border: #4488FF;
--animation-card-selected-bg: rgba(68,136,255,0.1);
--animation-card-pro-overlay: rgba(0,0,0,0.5);
--animation-pro-badge: #FFD700;         /* 골드 */
--animation-cta-bg: rgba(68,136,255,0.15);
--animation-cta-border: rgba(68,136,255,0.3);
```

### 타이포그래피
```css
.animation-card-label  { font-size: 11px; font-weight: 500; }
.animation-card-time   { font-size: 10px; color: rgba(255,255,255,0.4); }
.animation-section-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); }
```

### 스페이싱
```css
.animation-grid   { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.animation-panel  { padding: 12px; }
.animation-card   { padding: 8px; border-radius: 8px; }
```

---

## 🎞️ 애니메이션 아이콘 매핑

| Preset ID | 아이콘 | 설명 텍스트 |
|-----------|--------|-----------|
| `none` | ⊘ | 없음 |
| `fade-in` | 🌅 | 페이드 인 |
| `fade-out` | 🌇 | 페이드 아웃 |
| `slide-up` | ⬆️ | 슬라이드 업 |
| `slide-down` | ⬇️ | 슬라이드 다운 |
| `pop` | 💥 | 팝 |
| `typewriter` | ⌨️ | 타이핑 |
| `bounce` | 🏀 | 바운스 |
| `shake` | 〰️ | 쉐이크 |

---

## ♿ 접근성

- 모든 카드에 `aria-label="페이드 인 애니메이션 선택"` 적용
- 키보드 Tab 이동 지원
- 선택 상태 `aria-pressed="true"` 표시
- 색상만으로 상태 구분하지 않음 (체크 아이콘 병용)

---

**🔏 UI Designer 승인**: ✅ 와이어프레임, 디자인 토큰, 접근성 가이드 완료
