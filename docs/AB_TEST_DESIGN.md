# A/B 테스트 설계서 — AutoText 랜딩페이지

> 📅 작성일: 2026-03-11
> 🧪 실험 ID: landing-cta-v1, landing-headline-v1

---

## 1. 가설 (If-Then-Because)

### 실험 1: CTA 버튼 텍스트
> **If** 랜딩페이지의 메인 CTA 버튼 텍스트를 "지금 무료로 시작하기"에서 "30초만에 무료 체험하기"로 변경**하면**,
> **Then** CTA 클릭률(CTR)이 현재 대비 20% 이상 증가**할 것이다**,
> **Because** "30초"라는 구체적인 시간 제시가 진입 장벽을 낮추고 즉시성을 강조하여 행동 전환을 유도하기 때문이다.

### 실험 2: 서브 헤드라인
> **If** 서브 헤드라인을 기능 중심("업로드만 하면 끝...")에서 사회적 증거("매달 100만 뷰를 달성하는 크리에이터들...")로 변경**하면**,
> **Then** 페이지 체류시간이 15% 이상 증가하고 CTA 클릭까지의 전환율이 향상**될 것이다**,
> **Because** 사회적 증거(Social Proof)가 신뢰를 높이고 "나도 할 수 있다"는 동기를 부여하기 때문이다.

---

## 2. 변수 정의

### 실험 1: CTA 버튼
| 변수 유형 | 변수명 | 설명 |
|----------|--------|------|
| **독립변수** | CTA 버튼 텍스트 | A: "지금 무료로 시작하기" / B: "30초만에 무료 체험하기" |
| **종속변수** | CTA 클릭률(CTR) | impression 대비 click 비율 |
| **통제변수** | 버튼 위치, 색상, 크기, 페이지 레이아웃, 트래픽 소스 분배 | 동일하게 유지 |

### 실험 2: 서브 헤드라인
| 변수 유형 | 변수명 | 설명 |
|----------|--------|------|
| **독립변수** | 서브 헤드라인 텍스트 | A: "업로드만 하면 끝..." / B: "매달 100만 뷰를 달성하는 크리에이터들..." |
| **종속변수** | 페이지 체류시간, CTA 전환율 | 서브 헤드라인 → CTA 클릭 퍼널 |
| **통제변수** | 메인 헤드라인, CTA 버튼, 페이지 디자인 | 동일하게 유지 |

---

## 3. A안(Control) vs B안(Variant) 정의

### CTA 버튼 (`cta-button-test`)
| | A (Control) | B (Variant) |
|---|-------------|-------------|
| 텍스트 | 지금 무료로 시작하기 | 30초만에 무료 체험하기 |
| 색상 | 동일 (cyan-to-blue gradient) | 동일 |
| 크기 | 동일 | 동일 |
| 위치 | Hero 섹션 중앙 | 동일 |

### 서브 헤드라인 (`sub-headline-test`)
| | A (Control) | B (Variant) |
|---|-------------|-------------|
| 텍스트 | 업로드만 하면 끝. AI가 분석하고, 분류하고, 스타일까지 자동으로 입혀줍니다. | 매달 100만 뷰를 달성하는 크리에이터들의 공통점? 자막이 다릅니다. |
| 톤 | 기능 중심 (Feature-driven) | 사회적 증거 (Social Proof) |

---

## 4. 필요 표본 크기 계산

### 공식
```
n = (Z_α/2 + Z_β)² × [p₁(1-p₁) + p₂(1-p₂)] / (p₂ - p₁)²
```

### 파라미터
| 항목 | 값 |
|------|-----|
| 현재 전환율 (p₁) | 3.0% (추정) |
| 목표 전환율 (p₂) | 3.6% (+20% 상대적 증가) |
| 유의수준 α | 0.05 (양측) |
| 검정력 1-β | 0.80 |
| Z_α/2 | 1.96 |
| Z_β | 0.84 |

### 계산
```
n = (1.96 + 0.84)² × [0.03×0.97 + 0.036×0.964] / (0.036 - 0.03)²
  = (2.80)² × [0.0291 + 0.03470] / (0.006)²
  = 7.84 × 0.06380 / 0.000036
  = 7.84 × 1772.2
  ≈ 13,894 (그룹당)
  ≈ 27,788 (전체)
```

**그룹당 약 14,000명**, 전체 약 28,000명 필요.

---

## 5. 예상 실험 기간

| 항목 | 값 |
|------|-----|
| 일 평균 방문자 | 500명 (추정) |
| 필요 전체 표본 | 28,000명 |
| 예상 기간 | **약 56일 (8주)** |
| 최소 실행 기간 | 14일 (요일 효과 2주기 이상) |

> ⚠️ 일 평균 방문자가 1,000명이면 28일(4주)로 단축 가능

---

## 6. 성공/실패 판단 기준

### 통계 검정: 카이제곱(χ²) 검정

```
χ² = Σ (관측값 - 기대값)² / 기대값

| variant | click | no_click | total |
|---------|-------|----------|-------|
| A       | a     | b        | a+b   |
| B       | c     | d        | c+d   |
| total   | a+c   | b+d      | N     |
```

### 판단 기준
| 조건 | 판단 |
|------|------|
| p-value < 0.05 | **통계적으로 유의미** — 승리 variant 채택 |
| p-value ≥ 0.05 | 유의미하지 않음 — 추가 데이터 수집 또는 실험 재설계 |
| p-value < 0.01 | **매우 강한 증거** — 즉시 적용 권장 |

### 추가 안전장치
- 최소 14일 이상 실험 실행 (요일 효과 배제)
- 최소 그룹당 1,000 impression 이후 중간 분석
- Bonferroni 보정: 동시 실험 시 α = 0.05 / 실험 수

---

## 7. 기술 아키텍처

### 데이터 흐름
```
[방문자 접속]
  → cookie 확인 (ab_variant_{experiment})
  → 없으면 50:50 랜덤 배정 → cookie 저장 (30일)
  → DOM 탐색: [data-ab-test] 요소 찾기
  → variant B면 data-ab-variant-b 텍스트로 교체
  → impression 이벤트 → POST /api/ab/track
  → CTA 클릭 시 → click 이벤트 → POST /api/ab/track
```

### Supabase 테이블: `ab_events`
```sql
CREATE TABLE ab_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_name TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'conversion')),
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ab_events_experiment ON ab_events(experiment_name);
CREATE INDEX idx_ab_events_created ON ab_events(created_at);
```

### 파일 구조
```
src/
  lib/analytics/ab-test.ts       — cookie 기반 분배 + DOM 교체 + 이벤트 전송
  app/api/ab/track/route.ts      — 이벤트 저장 API
  app/api/ab/results/route.ts    — 실험 결과 조회 API
  app/admin/experiments/page.tsx  — 관리자 대시보드
```
