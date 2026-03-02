# Google Analytics 스타일 방문자 분석 기능 구현 기획서

## 📋 프로젝트 개요

현재 프로젝트의 어드민 대시보드에 Google Analytics 스타일의 방문자 분석 기능을 추가/고도화합니다.
기존 Hotjar 스타일의 클릭/스크롤 추적 기능을 확장하여, 더욱 체계적인 방문자 데이터 수집 및 분석이 가능하도록 합니다.

---

## 🎯 핵심 목표

### 1. 데이터 수집 고도화
- ✅ **기존**: 클릭, 스크롤, Rage/Dead Click 추적
- 🆕 **신규**: 체계적인 방문 기록 수집 (`page_views` 테이블)
- 🆕 **신규**: UTM 파라미터, 디바이스 정보, 체류시간 자동 계산

### 2. 분석 대시보드 강화
- ✅ **기존**: 히트맵, 스크롤맵, Rage/Dead Click 목록
- 🆕 **신규**: GA 스타일 KPI 요약 카드 (4개)
- 🆕 **신규**: 5가지 시각화 차트 (Recharts)

---

## 📊 데이터 모델 설계

### `page_views` 테이블 구조

```sql
CREATE TABLE page_views (
  id UUID PRIMARY KEY,
  session_id TEXT NOT NULL,           -- 세션 식별자
  page_url TEXT NOT NULL,              -- 페이지 URL
  referrer TEXT,                       -- 유입 경로
  utm_source TEXT,                     -- UTM 소스
  utm_medium TEXT,                     -- UTM 미디엄
  utm_campaign TEXT,                   -- UTM 캠페인
  device_type TEXT,                    -- mobile/tablet/desktop
  browser TEXT,                        -- 브라우저명
  os TEXT,                             -- 운영체제
  screen_width INTEGER,                -- 화면 너비
  duration_seconds INTEGER DEFAULT 0,  -- 체류시간 (초)
  is_bounce BOOLEAN DEFAULT TRUE,      -- 이탈 여부
  created_at TIMESTAMPTZ DEFAULT NOW() -- 생성 시간
);
```

### 데이터 흐름

```
사용자 페이지 방문
    ↓
[tracker.ts] page_view 이벤트 생성
    ↓
[store.ts] insertEvents() 호출
    ↓
┌─────────────────────────────────────┐
│ 1. analytics_events 테이블에 저장    │
│ 2. page_views 테이블에 신규 레코드 생성 │
└─────────────────────────────────────┘
    ↓
사용자 페이지 이탈
    ↓
[tracker.ts] page_leave 이벤트 생성 (time_on_page 포함)
    ↓
[store.ts] insertEvents() 호출
    ↓
┌─────────────────────────────────────┐
│ 1. analytics_events 테이블에 저장    │
│ 2. page_views 테이블 업데이트:       │
│    - duration_seconds = time_on_page │
│    - is_bounce = false (다른 페이지 이동 시) │
└─────────────────────────────────────┘
```

---

## 🔧 구현 계획

### Phase 1: 데이터 수집 로직 구현

#### 1.1 `insertEvents` 함수 확장 (`src/lib/analytics/store.ts`)

**기능**:
- `page_view` 이벤트가 있을 때:
  1. `analytics_events` 테이블에 저장 (기존)
  2. `page_views` 테이블에 신규 레코드 생성 (신규)
     - `session_id`, `page_url`, `referrer`, UTM 파라미터, 디바이스 정보 저장
     - `duration_seconds = 0`, `is_bounce = true` (초기값)

- `page_leave` 이벤트가 있을 때:
  1. `analytics_events` 테이블에 저장 (기존)
  2. 해당 세션의 가장 최근 `page_view` 레코드 찾기
  3. `page_views` 테이블 업데이트:
     - `duration_seconds = time_on_page`
     - `is_bounce` 판단 로직:
       - 같은 세션 내에 다른 `page_view`가 있으면 `false`
       - 없으면 `true` (단일 페이지 방문)

**구현 예시**:
```typescript
export async function insertEvents(events: AnalyticsEvent[]): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    memoryStore.push(...events);
    return true;
  }

  // 1. analytics_events 테이블에 저장 (기존 로직)
  const eventRows = events.map(e => ({ /* ... */ }));
  await supabase.from('analytics_events').insert(eventRows);

  // 2. page_view 이벤트 처리
  const pageViews = events.filter(e => e.event_type === 'page_view');
  if (pageViews.length > 0) {
    const pvRows = pageViews.map(e => ({
      session_id: e.session_id,
      page_url: e.page_url,
      referrer: e.referrer || null,
      utm_source: e.utm_source || null,
      utm_medium: e.utm_medium || null,
      utm_campaign: e.utm_campaign || null,
      device_type: e.device_type || 'desktop',
      browser: e.browser || 'Unknown',
      os: e.os || 'Unknown',
      screen_width: e.screen_width || 1920,
      duration_seconds: 0,
      is_bounce: true,
      created_at: e.created_at || new Date().toISOString(),
    }));
    await supabase.from('page_views').insert(pvRows);
  }

  // 3. page_leave 이벤트 처리
  const pageLeaves = events.filter(e => e.event_type === 'page_leave');
  for (const leave of pageLeaves) {
    // 해당 세션의 가장 최근 page_view 찾기
    const { data: recentPV } = await supabase
      .from('page_views')
      .select('id')
      .eq('session_id', leave.session_id)
      .eq('page_url', leave.page_url)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recentPV) {
      // 같은 세션 내 다른 페이지 방문 여부 확인
      const { data: otherPages } = await supabase
        .from('page_views')
        .select('id')
        .eq('session_id', leave.session_id)
        .neq('page_url', leave.page_url)
        .limit(1);

      await supabase
        .from('page_views')
        .update({
          duration_seconds: leave.time_on_page || 0,
          is_bounce: otherPages.length === 0,
        })
        .eq('id', recentPV.id);
    }
  }

  return true;
}
```

#### 1.2 `getStats` 함수 개선 (`src/lib/analytics/store.ts`)

**변경 사항**:
- `analytics_events` 테이블 대신 `page_views` 테이블을 주로 활용
- 더 정확한 방문자 수 계산 (세션 기반)
- 이탈률 계산 로직 개선 (`is_bounce` 필드 활용)

**구현 예시**:
```typescript
export async function getStats(days: number = 30): Promise<VisitorStats> {
  const supabase = getSupabase();
  const fetchDays = days === 0 ? 2 : Math.max(days, 2);
  const cutoff = new Date(Date.now() - fetchDays * 86400000).toISOString();

  // page_views 테이블에서 데이터 조회
  const { data: allPVs } = await supabase
    .from('page_views')
    .select('*')
    .gte('created_at', cutoff);

  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const yesterdayEnd = todayStart - 1;

  const todayPVs = allPVs.filter(pv => 
    new Date(pv.created_at).getTime() >= todayStart
  );
  const yesterdayPVs = allPVs.filter(pv => {
    const t = new Date(pv.created_at).getTime();
    return t >= yesterdayStart && t <= yesterdayEnd;
  });

  const todaySessions = new Set(todayPVs.map(p => p.session_id)).size;
  const yesterdaySessions = new Set(yesterdayPVs.map(p => p.session_id)).size;
  const change = yesterdaySessions === 0 
    ? (todaySessions > 0 ? 100 : 0)
    : Math.round(((todaySessions - yesterdaySessions) / yesterdaySessions) * 100);

  // 평균 체류시간
  const avgDuration = todayPVs.length === 0 
    ? 0 
    : Math.round(todayPVs.reduce((s, p) => s + (p.duration_seconds || 0), 0) / todayPVs.length);

  // 이탈률 (bounce rate)
  const bounceCount = todayPVs.filter(p => p.is_bounce).length;
  const bounceRate = todayPVs.length === 0 
    ? 0 
    : Math.round((bounceCount / todayPVs.length) * 100);

  // 가장 많이 본 페이지
  const pageCounts: Record<string, number> = {};
  todayPVs.forEach(pv => {
    pageCounts[pv.page_url] = (pageCounts[pv.page_url] || 0) + 1;
  });
  const topPage = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '/';

  return {
    today_visitors: todaySessions,
    yesterday_visitors: yesterdaySessions,
    visitor_change_pct: change,
    avg_duration: avgDuration,
    bounce_rate: bounceRate,
    top_page: topPage,
  };
}
```

#### 1.3 `getChartData` 함수 개선 (`src/lib/analytics/store.ts`)

**변경 사항**:
- `page_views` 테이블을 활용하여 더 정확한 차트 데이터 생성
- 유입 경로, 디바이스 분포 등은 `page_views` 테이블의 필드를 직접 활용

---

### Phase 2: 대시보드 UI 구현

#### 2.1 요약 카드 (4개)

**위치**: `/admin/analytics` 페이지 상단

**카드 구성**:
1. **오늘 방문자 수**
   - 값: 고유 세션 수 (오늘)
   - 증감율: 어제 대비 % (초록/빨강 배지)
   - 아이콘: 👥 (group)

2. **평균 체류시간**
   - 값: 초 단위 → "X분 Y초" 형식
   - 부제: "세션당 평균"
   - 아이콘: ⏱️ (timer)

3. **이탈률**
   - 값: "X%"
   - 부제: "단일 페이지 방문"
   - 아이콘: 🚪 (exit_to_app)

4. **가장 많이 본 페이지**
   - 값: 페이지 URL (최대 30자)
   - 부제: "조회수 기준 TOP"
   - 아이콘: 📈 (trending_up)

#### 2.2 차트 섹션 (5개)

**위치**: 요약 카드 하단, 그리드 레이아웃

**차트 구성**:

1. **일별 방문자 추이** (최근 30일)
   - 타입: Area Chart (Recharts)
   - X축: 날짜 (YYYY-MM-DD)
   - Y축: 방문자 수
   - 색상: Cyan 그라데이션 (#00D4D4)

2. **유입 경로 비율**
   - 타입: Pie Chart (Recharts)
   - 데이터: UTM 소스 또는 referrer 도메인
   - 상위 5개만 표시
   - 범례: 우측 수직 배치

3. **디바이스별 분류**
   - 타입: Donut Chart (Recharts)
   - 데이터: mobile / desktop / tablet
   - 색상: 모바일(Cyan), 데스크톱(Blue), 태블릿(Purple)

4. **시간대별 방문 분포**
   - 타입: Bar Chart (Recharts)
   - X축: 0시 ~ 23시
   - Y축: 방문 횟수
   - 색상: Blue (#3B82F6)

5. **페이지별 체류시간 TOP 5**
   - 타입: Horizontal Bar Chart (Recharts)
   - Y축: 페이지 URL
   - X축: 평균 체류시간 (초)
   - 색상: Green (#10B981)

---

## 🎨 UI/UX 설계

### 레이아웃 구조

```
┌─────────────────────────────────────────────────────────┐
│ Header: 방문자 분석 대시보드 | 날짜 필터 | 새로고침 버튼 │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ 오늘 방문│ │ 평균 체류│ │ 이탈률   │ │ 최다 조회 │ │
│ │   1,234  │ │  2분 30초 │ │   45%    │ │   /home   │ │
│ │  +12%    │ │           │ │           │ │           │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                           │
│ ┌────────────────────┐ ┌────────────────────┐          │
│ │ 일별 방문자 추이    │ │ 시간대별 방문 분포 │          │
│ │ [Area Chart]       │ │ [Bar Chart]        │          │
│ └────────────────────┘ └────────────────────┘          │
│                                                           │
│ ┌────────────────────┐ ┌────────────────────┐          │
│ │ 유입 경로 비율      │ │ 디바이스별 분류    │          │
│ │ [Pie Chart]        │ │ [Donut Chart]      │          │
│ └────────────────────┘ └────────────────────┘          │
│                                                           │
│ ┌──────────────────────────────────────────────┐        │
│ │ 페이지별 체류시간 TOP 5                       │        │
│ │ [Horizontal Bar Chart]                       │        │
│ └──────────────────────────────────────────────┘        │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 스타일 가이드

- **배경색**: `#0d0d0d` (기존 어드민 테마 유지)
- **카드 배경**: `#1a1a1a`, 테두리 `#222`
- **강조 색상**: Cyan `#00D4D4` (기존 테마)
- **차트 색상 팔레트**: Cyan, Blue, Purple, Green, Orange, Red
- **폰트**: 기존 시스템 폰트 유지
- **아이콘**: Material Symbols (기존 사용 중)

---

## 📈 성능 최적화

### 1. 데이터베이스 쿼리 최적화
- `page_views` 테이블에 인덱스 활용:
  - `session_id` (이미 존재)
  - `created_at` (이미 존재)
  - `page_url` (추가 권장)

### 2. 캐싱 전략
- 대시보드 데이터는 30초마다 자동 갱신
- 사용자가 수동 새로고침 버튼 클릭 시 즉시 갱신

### 3. 배치 처리
- `page_leave` 이벤트 업데이트는 비동기 처리
- 여러 `page_leave` 이벤트가 동시에 들어와도 안전하게 처리

---

## ✅ 체크리스트

### Phase 1: 데이터 수집
- [ ] `insertEvents` 함수에 `page_views` 테이블 저장 로직 추가
- [ ] `page_leave` 이벤트 처리 시 `duration_seconds` 업데이트 로직 구현
- [ ] `is_bounce` 판단 로직 구현
- [ ] `getStats` 함수를 `page_views` 테이블 기반으로 개선
- [ ] `getChartData` 함수를 `page_views` 테이블 기반으로 개선

### Phase 2: 대시보드 UI
- [ ] 요약 카드 4개 컴포넌트 구현
- [ ] 일별 방문자 추이 차트 구현
- [ ] 유입 경로 비율 파이 차트 구현
- [ ] 디바이스별 분류 도넛 차트 구현
- [ ] 시간대별 방문 분포 바 차트 구현
- [ ] 페이지별 체류시간 TOP 5 수평 바 차트 구현
- [ ] 반응형 레이아웃 적용

### Phase 3: 테스트 및 검증
- [ ] 실제 페이지 방문 시 `page_views` 테이블에 데이터 저장 확인
- [ ] 페이지 이탈 시 `duration_seconds` 업데이트 확인
- [ ] 대시보드에서 모든 차트가 정상적으로 표시되는지 확인
- [ ] 날짜 필터 변경 시 데이터가 올바르게 필터링되는지 확인

---

## 🚀 배포 전 확인 사항

1. **Supabase 스키마 확인**
   - `page_views` 테이블이 생성되어 있는지 확인
   - 인덱스가 올바르게 설정되어 있는지 확인
   - RLS 정책이 올바르게 설정되어 있는지 확인

2. **환경 변수 확인**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. **의존성 확인**
   - `recharts` 패키지 설치 확인
   - `ua-parser-js` 패키지 설치 확인

---

## 📝 참고 사항

- 기존 `analytics_events` 테이블은 계속 사용되며, 클릭/스크롤 등 상세 이벤트 추적에 활용됩니다.
- `page_views` 테이블은 GA 스타일의 방문자 분석에 특화된 테이블입니다.
- 두 테이블은 서로 보완적으로 사용되며, 각각의 목적에 맞게 최적화되어 있습니다.
