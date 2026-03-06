# Hotjar 스타일 사용자 행동 추적 기능 고도화 기획서

## 📋 프로젝트 개요

기존 사용자 행동 추적 기능을 Hotjar 수준으로 고도화하여, 세션 녹화 및 향상된 히트맵 시각화를 제공합니다.

---

## 📌 핵심 요구사항 (사용자 정의)

### 확인하고 싶은 기능
1. **클릭 히트맵** — 어디를 많이 누르는지
2. **스크롤 맵** — 어디까지 읽는지
3. **Dead Click 탐지** — 반응 없는 곳 클릭
4. **Rage Click** — 분노 클릭(연타)
5. **세션 녹화** — 사용자 행동 리플레이

### 추적 스크립트 (모든 페이지에 자동 로드)
- **모든 클릭 이벤트**: X,Y 좌표, 클릭한 요소의 태그/클래스/텍스트
- **스크롤 깊이**: 25%, 50%, 75%, 100% 도달 시 기록
- **CTA 버튼 클릭**: `data-track="cta"` 속성이 있는 버튼 별도 추적
- **Rage Click 탐지**: 같은 위치에서 500ms 내 3회 이상 클릭 시 기록
- **페이지 체류 시간**: 페이지 진입~이탈 시간 기록

### 데이터 저장 (Supabase `analytics_events`)
| 컬럼 | 설명 |
|------|------|
| id | UUID |
| event_type | 클릭/스크롤/rage_click/dead_click 등 |
| page_url | 페이지 URL |
| element_info | 요소 정보 (태그/클래스/텍스트) |
| x_pos, y_pos | 좌표 |
| scroll_depth | 스크롤 깊이 (0-100) |
| session_id | 세션 식별 (localStorage 30분 만료) |
| created_at | 생성 시간 |
| user_agent, referrer | 유입 정보 |

### 관리자 페이지 (/admin/heatmap 또는 /admin/analytics)
- 페이지별 **클릭 히트맵** 시각화 (canvas 기반)
- **스크롤 깊이 분포** 바 차트
- **Rage Click** 발생 지점 목록
- **날짜 필터** (오늘/7일/30일)

### 주요 이슈 및 해결 방향
| 이슈 | 해결 방향 |
|------|-----------|
| `Blocked script execution... allow-scripts permission is not set` | iframe sandbox에 `allow-scripts` 명시 |
| 히트맵이 처음 잠깐 떴다가 사라짐 | 렌더링 안정화, useEffect 의존성 최적화 |
| 화면 전체가 heatmap에 전사되어야 함 | iframe 배경(실제 페이지) + Canvas 오버레이(히트맵) |

---

## 🎯 현재 상태 및 개선 사항

### ✅ 이미 구현된 기능
- 클릭 이벤트 추적 (X, Y 좌표, 요소 정보)
- 스크롤 깊이 추적 (25%, 50%, 75%, 100%)
- Rage Click 탐지 (500ms 내 3회 이상 클릭)
- Dead Click 탐지 (반응 없는 클릭)
- 페이지 체류 시간 추적
- 세션 관리 (30분 만료)
- 클릭 히트맵 시각화 (Canvas 기반)

### 🆕 추가 구현 필요 기능

#### 1. 세션 녹화 (Session Recording)
- **목적**: 사용자의 실제 행동을 비디오처럼 재생
- **기능**:
  - DOM 변경사항 추적 (MutationObserver)
  - 마우스 이동/클릭/스크롤 이벤트 기록
  - 입력 필드 변경 추적
  - 페이지 전환 추적
  - 타임스탬프 기반 재생

#### 2. 스크롤 맵 (Scroll Map) 구현
- **현재**: 탭만 존재, 구현 필요
- **기능**:
  - 페이지별 스크롤 깊이 분포 시각화
  - 히트맵 스타일로 스크롤 도달률 표시
  - 평균 스크롤 깊이 표시

#### 3. 히트맵 개선
- **문제점**:
  - iframe sandbox 오류 발생
  - 히트맵이 잠깐 나타났다가 사라짐
- **개선 사항**:
  - iframe sandbox 속성 수정 (`allow-scripts` 추가)
  - 화면 전체가 히트맵에 전사되고 그 위에 클릭 히트맵 오버레이
  - 히트맵 렌더링 안정화 (useEffect 의존성 최적화)

---

## 🏗️ 아키텍처 설계

### 1. 세션 녹화 시스템

#### 데이터 구조
```typescript
interface SessionRecord {
  session_id: string;
  page_url: string;
  start_time: number;
  end_time: number;
  events: RecordedEvent[];
}

interface RecordedEvent {
  type: 'dom_change' | 'click' | 'scroll' | 'input' | 'navigation' | 'resize';
  timestamp: number;
  data: {
    // DOM 변경
    mutations?: MutationRecord[];
    // 클릭
    x?: number;
    y?: number;
    element?: ElementInfo;
    // 스크롤
    scrollX?: number;
    scrollY?: number;
    // 입력
    inputValue?: string;
    // 네비게이션
    url?: string;
    // 리사이즈
    width?: number;
    height?: number;
  };
}
```

#### 저장 방식
- **Supabase 테이블**: `session_records`
  - `id`: UUID
  - `session_id`: TEXT (기존 세션 ID와 동일)
  - `page_url`: TEXT
  - `events`: JSONB (RecordedEvent[])
  - `start_time`: TIMESTAMPTZ
  - `end_time`: TIMESTAMPTZ
  - `created_at`: TIMESTAMPTZ

- **클라이언트 저장**: 
  - 실시간 이벤트 버퍼링 (메모리)
  - 페이지 이탈 시 자동 저장
  - 최대 이벤트 수 제한 (10,000개)

#### 녹화 스크립트 (`src/lib/analytics/recorder.ts`)
```typescript
class SessionRecorder {
  private events: RecordedEvent[] = [];
  private startTime: number;
  private mutationObserver: MutationObserver;
  private isRecording: boolean = false;

  start(): void {
    // DOM 변경 추적
    // 마우스/키보드 이벤트 리스너 등록
    // 스크롤 이벤트 리스너 등록
  }

  stop(): Promise<void> {
    // 이벤트 저장
    // 리스너 제거
  }

  private recordEvent(type: string, data: any): void {
    // 이벤트 버퍼에 추가
  }
}
```

### 2. 스크롤 맵 시각화

#### 컴포넌트 구조
```typescript
// src/app/admin/analytics/components/ScrollMap.tsx
function ScrollMap({ events, selectedPage }: Props) {
  // 스크롤 이벤트 필터링
  // 페이지 높이 계산
  // 히트맵 스타일로 시각화
  // 평균 스크롤 깊이 표시
}
```

#### 시각화 방식
- 페이지를 세로로 나눔 (0%, 25%, 50%, 75%, 100%)
- 각 구간별 도달 사용자 수를 색상 강도로 표시
- 파란색(낮음) → 노란색(중간) → 빨간색(높음)

### 3. 히트맵 개선

#### iframe Sandbox 수정
```tsx
<iframe
  sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
  // ...
/>
```

#### 히트맵 렌더링 안정화
- `useEffect` 의존성 배열 최적화
- `iframeLoaded` 상태 관리 개선
- 히트맵 그리기 로직을 `useCallback`으로 메모이제이션

#### 전체 화면 전사 방식
- iframe으로 실제 페이지 로드 (배경)
- Canvas로 히트맵 오버레이 (전면)
- `mix-blend-mode: screen` 사용

---

## 📊 데이터베이스 스키마

### 세션 녹화 테이블
```sql
CREATE TABLE session_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  events JSONB NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 인덱스
  INDEX idx_session_records_session_id (session_id),
  INDEX idx_session_records_page_url (page_url),
  INDEX idx_session_records_created_at (created_at)
);
```

---

## 🎨 UI/UX 설계

### 1. 세션 녹화 재생기

#### 위치
- `/admin/analytics` → "세션 녹화" 탭

#### 기능
- 세션 목록 (날짜, 페이지, 지속시간)
- 재생 컨트롤 (재생/일시정지, 속도 조절, 타임라인)
- 이벤트 타임라인 (클릭, 스크롤, 입력 등 마커)
- 페이지 미리보기 (iframe)

#### UI 컴포넌트
```tsx
<SessionPlayer
  sessionId={string}
  events={RecordedEvent[]}
  onPlay={() => void}
  onPause={() => void}
  onSeek={(time: number) => void}
  playbackSpeed={number}
/>
```

### 2. 스크롤 맵 탭

#### 시각화
- 페이지 높이를 세로 막대 그래프로 표시
- 각 구간(0-25%, 25-50%, 50-75%, 75-100%)별 색상 강도
- 평균 스크롤 깊이 수치 표시
- 페이지별 필터링

### 3. 히트맵 개선

#### 레이아웃
```
┌─────────────────────────────────┐
│  [히트맵 컨트롤]                 │
├─────────────────────────────────┤
│                                 │
│  [iframe: 실제 페이지]          │
│  [Canvas: 히트맵 오버레이]      │
│                                 │
└─────────────────────────────────┘
```

---

## 🔧 구현 단계

### Phase 1: 히트맵 개선 (우선순위 높음)
1. ✅ iframe sandbox 속성 수정
2. ✅ 히트맵 렌더링 안정화
3. ✅ 전체 화면 전사 방식 구현

### Phase 2: 스크롤 맵 구현
1. ✅ 스크롤 이벤트 데이터 필터링
2. ✅ 스크롤 맵 컴포넌트 구현
3. ✅ 시각화 로직 구현

### Phase 3: 세션 녹화 구현
1. ✅ `recorder.ts` 스크립트 작성
2. ✅ Supabase 테이블 생성
3. ✅ API 엔드포인트 구현 (`/api/analytics/record`)
4. ✅ 세션 녹화 재생기 컴포넌트 구현
5. ✅ AnalyticsProvider에 녹화 기능 통합

---

## 📝 구현 체크리스트

### 히트맵 개선
- [x] iframe sandbox 제거 (same-origin 시 스크립트 블로킹 해제)
- [x] 히트맵 렌더링 useEffect 의존성 최적화
- [x] iframe 로드 상태 관리 개선
- [x] 화면 전체 전사 (iframe 배경 + Canvas 오버레이)

### 스크롤 맵
- [x] 스크롤 이벤트 필터링 로직
- [x] ScrollMap 컴포넌트 구현
- [x] 스크롤 깊이 분포 계산
- [x] 시각화 렌더링

### 세션 녹화
- [x] SessionRecorder 클래스 구현
- [x] DOM 변경 추적 (MutationObserver)
- [x] 마우스/키보드 이벤트 추적
- [x] 이벤트 버퍼링 및 저장
- [x] Supabase 테이블 생성
- [x] API 엔드포인트 구현
- [x] SessionPlayer 컴포넌트 구현
- [x] 재생 로직 구현
- [x] AnalyticsProvider 통합

---

## 🚀 성능 고려사항

### 세션 녹화
- **이벤트 수 제한**: 세션당 최대 10,000개 이벤트
- **디바운싱**: DOM 변경 이벤트 디바운싱 (100ms)
- **압축**: 이벤트 데이터 압축 저장
- **청크 저장**: 큰 세션은 청크 단위로 저장

### 히트맵/스크롤 맵
- **캔버스 최적화**: requestAnimationFrame 사용
- **데이터 샘플링**: 대량 데이터는 샘플링하여 렌더링
- **메모이제이션**: 계산 결과 메모이제이션

---

## 🔒 보안 고려사항

### 세션 녹화
- **민감 정보 제외**: 
  - 비밀번호 필드 값 제외
  - 신용카드 번호 제외
  - 개인정보 필드 마스킹
- **동의**: GDPR 준수를 위한 사용자 동의 옵션

---

## 📈 향후 확장 가능성

1. **Heatmap 집계**: 여러 사용자의 히트맵을 합쳐서 표시
2. **A/B 테스트 연동**: 세션 녹화와 A/B 테스트 결과 연동
3. **AI 인사이트**: 세션 녹화 데이터를 AI로 분석하여 UX 개선 제안
4. **실시간 모니터링**: 현재 활성 세션 실시간 모니터링

---

## ✅ 완료 상태

- [x] 히트맵 개선 (sandbox 제거, 전체 화면 전사)
- [x] 스크롤 맵 구현
- [x] 세션 녹화 구현
- [x] 관리자 페이지: `/admin/analytics` (클릭 히트맵, 스크롤 맵, Rage Click, Dead Click, 세션 녹화 탭)

---

**작성일**: 2026-03-02
**버전**: 1.1
