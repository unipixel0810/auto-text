# 📐 Service Planner 스펙 스탬프
> **Role**: Service Planner | **Date**: 2026-03-11 | **Ref**: PM #00

---

## 🗺️ 사용자 플로우

```
[자막 클립 선택]
      ↓
[우측 사이드바 > "애니메이션" 탭 클릭]
      ↓
[프리셋 갤러리 표시]
  ├── IN 애니메이션 섹션 (등장)
  └── OUT 애니메이션 섹션 (퇴장)
      ↓
[프리셋 카드 클릭 → 즉시 미리보기 (Player에 반영)]
      ↓
[지속 시간 슬라이더 조정 (0.1s ~ 1.0s)]
      ↓
[적용 완료 → 타임라인 클립에 🎬 뱃지 표시]
```

---

## 📱 화면 시나리오 5종

### Scenario 1. 최초 진입 (자막 없을 때)
- 우측 사이드바 > 애니메이션 탭: "자막을 먼저 선택하세요" 빈 상태(Empty State)
- 회색 아이콘 + 안내 텍스트

### Scenario 2. 자막 선택 후 진입
- 프리셋 갤러리 8개 카드 표시
- 현재 적용된 프리셋에 파란 체크 표시
- "없음" 카드가 첫 번째 (기본값)

### Scenario 3. 프리셋 호버
- 카드 호버 시 Player에서 실시간 미리보기 (0.5초 루프)
- 호버 종료 시 원상 복귀

### Scenario 4. 프리셋 적용
- 클릭 즉시 적용 (저장 버튼 불필요)
- 타임라인의 해당 자막 클립에 🎬 아이콘 뱃지 표시
- 토스트 알림: "페이드 인 애니메이션이 적용되었습니다"

### Scenario 5. 프리미엄 프리셋 (잠금 상태)
- 🔒 아이콘 + "PRO" 뱃지 표시
- 클릭 시 업그레이드 모달(`UpgradeModal`) 호출
- 무료 사용자: fade-in, fade-out, slide-up 3종만 사용 가능

---

## 🏗️ 비즈니스 규칙

| 규칙 | 상세 |
|------|------|
| 무료 사용 가능 프리셋 | fade-in, fade-out, slide-up |
| 프리미엄 전용 프리셋 | slide-down, pop, typewriter, bounce, shake |
| 지속 시간 범위 | 0.1s ~ 1.0s (기본값 0.3s) |
| 적용 범위 | 선택된 자막 클립 1개 (일괄 적용 v2) |
| 실행 취소 | Ctrl+Z 지원 (히스토리에 push) |

---

## 📊 데이터 모델 확장

```typescript
// 기존 SubtitleItem에 animation 필드 추가
interface SubtitleAnimation {
  inPreset: AnimationPreset | null;   // 등장 애니메이션
  outPreset: AnimationPreset | null;  // 퇴장 애니메이션
  duration: number;                   // 지속 시간 (초)
}

type AnimationPreset =
  | 'fade-in' | 'fade-out'
  | 'slide-up' | 'slide-down'
  | 'pop' | 'typewriter'
  | 'bounce' | 'shake'
  | 'none';
```

---

## 📌 컴포넌트 목록

| 컴포넌트 | 파일 경로 | 역할 |
|----------|----------|------|
| `SubtitleAnimationPanel` | `src/components/editor/SubtitleAnimationPanel.tsx` | 애니메이션 탭 전체 UI |
| `AnimationPresetCard` | `src/components/editor/AnimationPresetCard.tsx` | 개별 프리셋 카드 |
| `AnimationDurationSlider` | `src/components/editor/AnimationDurationSlider.tsx` | 지속 시간 슬라이더 |

---

**🔏 Service Planner 승인**: ✅ 화면 시나리오 5종, 비즈니스 규칙, 데이터 모델 정의 완료
