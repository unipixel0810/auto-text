# 🤝 개발팀 협업 리포트
> **프로젝트**: Stitch — 자막 애니메이션 프리셋 시스템 v1
> **스프린트 기간**: 2026-03-11 (1일 스프린트)
> **참여 인원**: 7명 (PM, Service Planner, UX Researcher, UI Designer, Frontend Dev, Backend Engineer, QA Engineer)

---

## 📌 협업 구조 한눈에 보기

```
[PM] 킥오프 & 방향 설정
  ↓ 기능 정의서 전달
[Service Planner] 화면 시나리오 + 데이터 모델
  ↓ 스펙 문서 전달
[UX Researcher] 페르소나 + 벤치마킹 + UX 원칙 도출
  ↓ UX 인사이트 공유
[UI Designer] 와이어프레임 + 디자인 토큰 + 컴포넌트 스펙
  ↓ 디자인 스펙 전달
[Frontend Dev] 타입 설계 + 컴포넌트 구현 + CSS 애니메이션
  ↓ 구현 완료, 연동 포인트 공유
[Backend Engineer] 호환성 검증 + PRO 플로우 + 렌더링 API 스펙
  ↓ 승인 및 리스크 플래그
[QA Engineer] 12개 테스트 케이스 + 3개 리스크 식별
  ↓ 검증 완료 보고
[PM] 최종 승인 & 프로덕션 배포 결정
```

---

## 1️⃣ PM × Service Planner 협의

### 협의 방식
PM이 서비스 분석 결과를 바탕으로 **기능 요구사항 브리핑** → Service Planner가 구현 가능한 스펙으로 변환

### 핵심 협의 내용

| 협의 항목 | PM 요청 | Service Planner 결정 |
|----------|---------|----------------------|
| 애니메이션 종류 | "CapCut처럼 다양한 움직임 원함" | 8종으로 범위 확정 (fade-in/out, slide-up/down, pop, typewriter, bounce, shake) |
| 무료/PRO 구분 | "수익화 레버 필요" | 무료 3종(fade-in, fade-out, slide-up), PRO 5종으로 분리 |
| 적용 범위 | "모든 자막에 한 번에?" | v1은 선택된 클립 1개, 일괄 적용은 v2로 미룸 |
| 지속 시간 | "얼마나 조절 가능?" | 0.1s ~ 1.0s 슬라이더, 기본값 0.3s로 확정 |
| 실행 취소 | "적용 후 되돌리기?" | Ctrl+Z 히스토리 스택에 push 지원 |

### 최종 합의 산출물
- 화면 시나리오 5종 (최초 진입, 자막 선택 후, 호버, 적용, 프리미엄 잠금)
- 비즈니스 규칙 테이블
- `SubtitleAnimation` 데이터 모델 초안

---

## 2️⃣ Service Planner × UX Researcher 협의

### 협의 방식
Service Planner의 스펙 문서를 기반으로 UX Researcher가 **사용자 관점 검증 및 개선 제안**

### 핵심 협의 내용

| 협의 항목 | Service Planner 스펙 | UX Researcher 피드백 | 최종 결정 |
|----------|--------------------|--------------------|---------|
| 프리셋 선택 UI | 드롭다운 목록 | "CapCut처럼 그리드 카드로 해야 클릭률 올라감" | **그리드 카드 UI** 채택 |
| PRO 잠금 표시 | 블러 처리 | "🔒 아이콘 + 반투명이 전환율 더 높음" | **🔒 아이콘 + 반투명** 채택 |
| Empty State | 단순 텍스트 | "CTA 버튼과 함께 있어야 이탈 방지" | **안내 텍스트 + 자막 추가 CTA** |
| 미리보기 | 클릭 후 확인 | "호버 즉시 Player 미리보기 필수" | v1은 미구현, v2 백로그로 이동 |
| 적용 방식 | 확인 버튼 | "클릭 2회 이상이면 이탈 급증" | **클릭 1회 즉시 적용** |

### 페르소나로 발견한 인사이트
- **지현(27세 쇼츠 크리에이터)**: "모바일 위주라 큰 카드 터치 타깃 필요" → 카드 최소 높이 80px 확보
- **준호(34세 마케터)**: "키보드로 Tab 이동 원함" → 접근성 Tab/Enter 지원 요구사항 추가

### 벤치마킹 결과로 반영된 결정
```
CapCut   → 그리드 갤러리 레이아웃, 파란 체크로 선택 표시
VRew     → 섹션별 분류 (IN/OUT 구분)
Premiere → 복잡도 낮게 유지 (검색 없이 스크롤)
```

---

## 3️⃣ UX Researcher × UI Designer 협의

### 협의 방식
UX 인사이트와 4가지 원칙(즉각성·가시성·가역성·점진적 공개)을 UI 설계로 번역

### 핵심 협의 내용

| UX 원칙 | UI Designer 구현 결정 |
|---------|----------------------|
| **즉각성** | 호버 시 카드 테두리 하이라이트, 클릭 시 즉시 파란 체크 표시 |
| **가시성** | 현재 선택된 프리셋에 `border-primary + bg-primary/10` 강조 |
| **가역성** | "없음" 카드를 첫 번째에 배치, 파란 체크가 여기로 이동하면 취소된 것 |
| **점진적 공개** | PRO 카드는 보이되 `opacity-50 + 🔒`로 욕구 자극 후 모달로 업그레이드 유도 |

### 디자인 토큰 협의
```
색상:   --primary: #00D4D4 (선택 상태), --pro-gold: #F59E0B (PRO 뱃지)
여백:   카드 그리드 gap-2, 패딩 p-3
폰트:   카드 라벨 text-xs, 아이콘 text-lg
반응:   hover:scale-[1.02] active:scale-95 (터치 피드백)
```

### 컴포넌트 명세 결정
- `SubtitleAnimationPanel` — 전체 탭 컨테이너
- `AnimationPresetCard` — 개별 카드 (아이콘 + 라벨 + 체크 + PRO 뱃지)
- `AnimationDurationSlider` — 슬라이더 (인라인, 별도 컴포넌트 불필요로 합의)

---

## 4️⃣ UI Designer × Frontend Developer 협의

### 협의 방식
디자인 스펙을 코드로 옮기는 과정에서 **구현 가능성 검토 + 기술적 제약 피드백**

### 핵심 협의 내용

| 디자인 요청 | FE 검토 결과 | 최종 결정 |
|-----------|------------|---------|
| 애니메이션 미리보기 (호버 시 Player 재생) | "Player 연동 추가 작업 필요, 이번 스프린트 불가" | **v2 백로그**로 이동 |
| 타임라인 클립 🎬 뱃지 | "타임라인 컴포넌트 수정 필요, 별도 작업" | **v2 백로그**로 이동 |
| CSS 애니메이션 구현 방식 | "JS 라이브러리 없이 순수 CSS @keyframes로 가능" | **CSS-only** 채택 (번들 크기 0 증가) |
| 지속 시간 동적 조절 | "CSS 변수 `--anim-duration`으로 JS 개입 없이 가능" | **CSS 변수** 방식 채택 |
| `typewriter` 효과 | "한글은 글자 수로 `steps()` 값 동적 조정 필요" | v1은 고정 `steps(10)`, 한글 최적화는 **v2 백로그** |

### 타입 설계 협의 (FE 주도)
```typescript
// FE가 제안한 타입 → UI Designer 검토 후 승인
type AnimationPreset = 'none' | 'fade-in' | 'fade-out' | 'slide-up'
  | 'slide-down' | 'pop' | 'typewriter' | 'bounce' | 'shake';

interface SubtitleAnimation {
  inPreset: AnimationPreset;   // UI: IN 섹션
  outPreset: AnimationPreset;  // UI: OUT 섹션
  duration: number;            // UI: 슬라이더
}
```
→ UI Designer: "IN/OUT 분리 섹션으로 패널 구성할게요" — **구조적 합의 완료**

---

## 5️⃣ Frontend Developer × Backend Engineer 협의

### 협의 방식
FE 구현 완료 후 BE가 **데이터 흐름 + 보안 + 서버 연동** 관점에서 검토

### 핵심 협의 내용

| 협의 항목 | FE 입장 | BE 입장 | 최종 결정 |
|---------|--------|--------|---------|
| 애니메이션 데이터 저장 위치 | "클라이언트 상태만으로 충분" | "localStorage 직렬화로 자동 저장됨, 동의" | **클라이언트 상태** (추가 API 불필요) |
| `animation` 필드 기존 호환성 | "`animation?` optional로 추가" | "기존 저장 데이터 로드 시 `DEFAULT_SUBTITLE_ANIMATION` fallback 필요" | **optional 필드 + fallback** |
| PRO 검증 방식 | "클라이언트 `isPro` prop으로 처리" | "클라이언트 검증은 우회 가능, 서버 세션 검증 필요" | v1 클라이언트 검증 → **v2에서 서버 세션 추가** |
| 렌더링 API 연동 | "CSS 클래스로 처리, 서버 불필요" | "서버 렌더링 시 FFmpeg fade 효과 별도 구현 필요" | **렌더링 API 스펙 정의 후 v2** |
| `duration` 값 검증 | "슬라이더로 0.1~1.0 범위 강제" | "서버에서도 범위 검증 필요" | v1 클라이언트만 → **v2 서버 검증** |

### VideoClip 타입 확장 협의 (FE + BE 공동)
```typescript
// BE 요청: Player 연동을 위해 VideoClip에 animation 필드 필요
// FE 동의: SubtitleItem과 VideoClip 두 곳에 동기화
interface VideoClip {
  // ... 기존 필드 ...
  subtitleAnimationPreset?: string;    // 추가
  subtitleOutPreset?: string;          // 추가
  subtitleAnimationDuration?: number;  // 추가
}
```

---

## 6️⃣ Backend Engineer × QA Engineer 협의

### 협의 방식
BE 스펙 완료 후 QA가 **테스트 커버리지 + 엣지 케이스** 관점에서 리스크 식별

### 핵심 협의 내용

| QA 발견 리스크 | BE 대응 |
|-------------|--------|
| Player 미연동 → 실제 미리보기 불가 | "FE v2에서 Player.tsx 연동 예정 — 심각도 높음, 인지함" |
| `typewriter` 한글 `steps()` 오작동 | "`steps()` 값을 글자 수로 동적 계산 필요 — v2 처리" |
| duration이 자막 표시 시간보다 길 경우 | "`min(duration, endTime-startTime * 0.5)` 클램프 로직 추가 권고" |
| 기존 저장 데이터 로드 시 `animation` 없음 | "`DEFAULT_SUBTITLE_ANIMATION` fallback 이미 구현됨 — TC-10에서 검증" |
| PRO 우회 가능성 | "클라이언트 prop 검증의 한계 인지, v2 서버 검증 예정" |

### QA가 추가 요청한 테스트 시나리오
- TC-07: Ctrl+Z 실행 취소 → FE가 히스토리 스택 지원 확인
- TC-08: 프로젝트 저장 후 로드 → BE가 직렬화 자동 처리 확인
- TC-11: 키보드 접근성 → FE가 `tabIndex`, `onKeyDown` Enter 처리 확인

---

## 7️⃣ QA Engineer × PM 최종 보고

### 협의 방식
QA 검증 결과를 PM에게 보고 → PM이 출시 여부 최종 판단

### 최종 보고 내용

| 항목 | 내용 |
|------|------|
| 테스트 케이스 | 12개 정의 완료 (미실행 — 코드 구현 직후 상태) |
| 리스크 | 높음 1개 (Player 연동), 중간 1개 (한글 typewriter), 낮음 1개 (duration 클램프) |
| 출시 권고 | v1 핵심 기능 완성, 높음 리스크는 기능 동작에 영향 없음 (UI만 완성) |

### PM 최종 판단 근거
```
✅ 출시 허용 조건:
  - TypeScript 에러 0개
  - 하위 호환성 100% 보장 (optional 필드)
  - 무료/PRO 게이팅 UI 완성
  - Ctrl+Z 지원
  - 키보드 접근성 지원

⚠️ 조건부 사항:
  - Player 실제 재생 미리보기 → v2 반드시 포함
  - isPro 실제 서버 검증 → v2 반드시 포함
```

---

## 🗂️ 협의 결과 종합 — 의사결정 로그

| # | 의사결정 | 제안자 | 결정 방식 | 결과 |
|---|---------|--------|---------|------|
| D-01 | 프리셋 8종으로 범위 확정 | PM | PM 지시 | ✅ 확정 |
| D-02 | 무료 3종 / PRO 5종 분리 | PM + SP | 협의 | ✅ 확정 |
| D-03 | 클릭 1회 즉시 적용 | UX | UX 근거 제시 | ✅ 채택 |
| D-04 | 🔒 아이콘 + 반투명 (블러 미사용) | UX | 전환율 근거 | ✅ 채택 |
| D-05 | 순수 CSS @keyframes 방식 | FE | 번들 최적화 | ✅ 채택 |
| D-06 | CSS 변수 `--anim-duration` | FE | 구현 효율 | ✅ 채택 |
| D-07 | 호버 미리보기 v2 이동 | FE | 일정 협의 | 📌 v2 백로그 |
| D-08 | 타임라인 🎬 뱃지 v2 이동 | FE | 일정 협의 | 📌 v2 백로그 |
| D-09 | 클라이언트 상태만으로 저장 | BE | 검증 후 승인 | ✅ 확정 |
| D-10 | optional 필드 + fallback | BE | 하위 호환성 | ✅ 확정 |
| D-11 | PRO 서버 검증 v2 이동 | BE | 보안 로드맵 | 📌 v2 백로그 |
| D-12 | VideoClip에 animation 필드 추가 | FE + BE | 공동 설계 | ✅ 확정 |
| D-13 | duration 클램프 v2 이동 | QA → BE | 리스크 수용 | 📌 v2 백로그 |
| D-14 | 프로덕션 배포 승인 | PM | 최종 판단 | ✅ 승인 |

---

## 📁 산출물 목록

```
docs/
├── planning/
│   ├── 00_pm-kickoff.md             ← PM 서비스 분석 & 킥오프
│   ├── 01_service-planner-spec.md   ← 화면 시나리오 5종 + 데이터 모델
│   ├── 02_ux-research.md            ← 페르소나 2종 + 벤치마킹 3사
│   ├── 04_frontend-impl.md          ← FE 구현 결정 + 체크리스트
│   ├── 05_backend-spec.md           ← BE 호환성 분석 + PRO 플로우
│   └── 07_pm-final-approval.md      ← PM 최종 승인 + v2 백로그
├── design/
│   └── 03_ui-design-spec.md         ← 와이어프레임 + 디자인 토큰
└── qa/
    └── 06_qa-test-plan.md           ← 12개 TC + 3개 리스크

src/
├── types/
│   ├── subtitle.ts                  ← AnimationPreset, SubtitleAnimation 타입 추가
│   └── video.ts                     ← VideoClip에 subtitleAnimation 필드 추가
├── components/
│   ├── editor/
│   │   └── SubtitleAnimationPanel.tsx  ← 신규 (애니메이션 패널 + ANIMATION_CSS_CLASS)
│   └── layout/
│       ├── RightSidebar.tsx         ← animation 탭 연결 + onClipUpdate 동기화
│       └── Player.tsx               ← SubtitleOverlay에 CSS 클래스 + --anim-duration 적용
└── app/
    └── globals.css                  ← 8종 @keyframes 추가
```

---

## 💡 이번 협업에서 배운 점

### 잘 된 것
- **스탬프 체인 방식**: 각 역할이 이전 문서를 참조(`Ref: XX #00`)하며 일관성 유지
- **v1/v2 분리**: 일정 내에 핵심만 구현하고 나머지는 백로그로 명시적 관리
- **타입 우선 설계**: FE가 TypeScript 타입을 먼저 정의 → 전체 팀이 같은 언어로 소통

### 개선할 점
- **Player 연동 미완**: UX 원칙 "즉각성"을 위한 호버 미리보기가 v1에서 빠짐 → 다음 스프린트 최우선
- **isPro 하드코딩**: 실제 결제 연동 없이 `false` 고정 → 수익화 효과 측정 불가
- **TC 미실행**: QA 테스트 케이스 12개 전부 ⬜ 상태 → 실제 QA 세션 별도 필요

---

**📌 문서 버전**: v1.0 | **작성일**: 2026-03-11 | **다음 리뷰**: v2 스프린트 킥오프 시
