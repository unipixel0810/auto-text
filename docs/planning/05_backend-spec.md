# ⚙️ Backend Engineer 스탬프
> **Role**: Backend Engineer | **Date**: 2026-03-11 | **Ref**: FE #04

---

## 🔍 백엔드 영향 분석

자막 애니메이션 프리셋은 **클라이언트 사이드 상태**(`SubtitleItem.animation`)에 저장되므로,
현재 로컬 localStorage 기반 프로젝트 저장 구조와 완전히 호환됩니다.

### 추가 API 불필요 항목
- 애니메이션 선택/적용 → 클라이언트 상태만 변경
- CSS 렌더링 → 브라우저 처리
- 프리셋 목록 → 클라이언트 상수(`ANIMATION_PRESET_META`)

### 백엔드 관여 항목
1. **PRO 구독 검증** — 기존 `/api/auth` + `isPro` 필드 확장
2. **프로젝트 저장 시** — `SubtitleItem.animation` 필드가 자동 직렬화됨 (추가 작업 불필요)
3. **렌더링 API** — 서버 렌더링 시 애니메이션 메타데이터 전달 필요

---

## 🔐 PRO 구독 검증 플로우

```
클라이언트: isPro prop 전달
    ↓
SubtitleAnimationPanel: PRO 프리셋 클릭 시 isPro 확인
    ↓
isPro === false → UpgradeModal 호출
    ↓
Toss Payments → 결제 완료
    ↓
/api/payment/toss/confirm → isPro = true 반환
    ↓
클라이언트 상태 업데이트 → PRO 프리셋 잠금 해제
```

---

## 📦 타입 호환성 확인

```typescript
// 기존 SubtitleItem 저장 구조 (localStorage)
{
  id: "s1",
  startTime: 0,
  endTime: 3,
  text: "안녕하세요",
  type: "ENTERTAINMENT",
  confidence: 0.9,
  // ✅ 새 필드 — optional이므로 기존 저장 데이터에 영향 없음
  animation: {
    inPreset: "fade-in",
    outPreset: "none",
    duration: 0.3
  }
}
```

`animation` 필드가 `optional`로 정의되어 **하위 호환성 완전 보장**.
기존 저장된 프로젝트 로드 시 `animation` 없으면 `DEFAULT_SUBTITLE_ANIMATION` 적용.

---

## 🎬 렌더링 API 확장 제안 (`/api/video/render`)

현재 미구현된 서버 렌더링 API에 애니메이션 메타데이터 추가 스펙:

```typescript
// Request body 확장
interface RenderRequest {
  // ... 기존 필드 ...
  subtitles: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    style: SubtitleStyle;
    animation?: SubtitleAnimation;  // 새 필드
  }>;
}
```

서버 렌더링 시 FFmpeg filter_complex로 fade 효과 구현 가능:
```bash
# fade-in 예시
[0:v]fade=in:0:9[faded]  # 9프레임 = 0.3s @ 30fps
```

---

## 🔒 보안 고려사항

| 항목 | 현황 | 권고 |
|------|------|------|
| PRO 검증 | 클라이언트 `isPro` prop | 서버 세션 기반 검증 추가 필요 |
| 애니메이션 값 검증 | 없음 | `duration` 범위(0.1~1.0) 서버 검증 |
| Rate limiting | 없음 | 렌더링 API에 IP 기반 제한 추가 |

---

**🔏 Backend Engineer 승인**: ✅ 하위 호환성 확인, PRO 플로우 정의, 렌더링 확장 스펙 완료
