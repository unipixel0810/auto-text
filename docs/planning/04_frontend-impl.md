# 💻 Frontend Developer 구현 스탬프
> **Role**: Frontend Dev | **Date**: 2026-03-11 | **Ref**: UI #03

---

## 📁 생성/수정 파일 목록

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/types/subtitle.ts` | 수정 | `AnimationPreset`, `SubtitleAnimation` 타입 추가 |
| `src/components/editor/SubtitleAnimationPanel.tsx` | 신규 | 애니메이션 패널 메인 컴포넌트 |
| `src/components/layout/RightSidebar.tsx` | 수정 | animation 탭에 패널 연결 |
| `src/app/globals.css` | 수정 | 8종 애니메이션 @keyframes 추가 |

---

## 🏗️ 구현 결정 사항

### 1. 타입 설계
```typescript
// subtitle.ts에 추가
export type AnimationPreset = 'none' | 'fade-in' | 'fade-out' | 'slide-up' |
  'slide-down' | 'pop' | 'typewriter' | 'bounce' | 'shake';

export interface SubtitleAnimation {
  inPreset: AnimationPreset;
  outPreset: AnimationPreset;
  duration: number;  // 0.1 ~ 1.0s
}

// SubtitleItem에 추가
animation?: SubtitleAnimation;
```

### 2. CSS 애니메이션 전략
- CSS `@keyframes` + `--anim-duration` CSS 변수로 지속 시간 동적 조절
- JS로 재생 시점에 클래스 토글 (Player에서 처리)
- `typewriter`는 `clip-path` inset 방식으로 순수 CSS 구현

### 3. PRO 게이팅
```typescript
const FREE_ANIMATION_PRESETS = ['none', 'fade-in', 'fade-out', 'slide-up'];
// PRO 프리셋 클릭 시 → UpgradeModal 호출
```

### 4. 자막 선택 방식
- RightSidebar에서 `currentTime` 기준으로 활성 자막 자동 선택
- `subtitles.find(s => s.startTime <= currentTime && s.endTime >= currentTime)`

---

## 🔌 Player 연동 (TODO — Backend/Player 담당)

Player.tsx에서 자막 렌더링 시 애니메이션 클래스 적용 필요:
```typescript
// Player.tsx 자막 렌더링 부분에 추가
const animClass = subtitle.animation?.inPreset
  ? ANIMATION_CSS_CLASS[subtitle.animation.inPreset]
  : '';
const animDuration = subtitle.animation?.duration ?? 0.3;

<div
  className={`subtitle-overlay ${animClass}`}
  style={{ '--anim-duration': `${animDuration}s` } as React.CSSProperties}
>
  {subtitle.text}
</div>
```

---

## ✅ 완료 항목
- [x] `AnimationPreset` 타입 정의
- [x] `SubtitleAnimation` 인터페이스
- [x] `ANIMATION_PRESET_META` 메타데이터 (아이콘, PRO 여부)
- [x] `SubtitleAnimationPanel` 컴포넌트
- [x] `AnimationPresetCard` 하위 컴포넌트 (PRO 잠금 UI 포함)
- [x] 지속 시간 슬라이더
- [x] PRO CTA 버튼
- [x] globals.css 애니메이션 8종
- [x] RightSidebar animation 탭 연결
- [x] TypeScript 에러 0개 확인

## 🔲 미완료 (다음 스프린트)
- [ ] Player.tsx에서 실제 애니메이션 클래스 토글 (재생 시점 동기화)
- [ ] 타임라인 클립에 🎬 뱃지 표시

---

**🔏 Frontend Dev 승인**: ✅ 핵심 컴포넌트 구현 완료, TS 에러 0
