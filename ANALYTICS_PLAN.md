# 사용자 행동 추적 기능 구현 기획서

## 📋 프로젝트 개요

현재 비디오 에디터 프로젝트에 Hotjar 스타일의 사용자 행동 분석 기능을 추가합니다.

---

## 🎯 핵심 기능

### 1. 추적 이벤트
- ✅ **클릭 이벤트**: 좌표(x, y), 요소 정보(태그, 클래스, 텍스트)
- ✅ **스크롤 깊이**: 25%, 50%, 75%, 100% 마일스톤
- ✅ **CTA 버튼**: `data-track="cta"` 속성 추적
- ✅ **Rage Click**: 동일 위치 500ms 내 3회 이상 클릭
- ✅ **Dead Click**: 반응 없는 요소 클릭
- ✅ **페이지 체류 시간**: 진입~이탈 시간
- ✅ **세션 정보**: 30분 세션 관리 (localStorage)

### 2. 관리자 대시보드
- 📊 **클릭 히트맵**: Canvas 기반 시각화
- 📈 **스크롤 맵**: 페이지별 스크롤 깊이 분포
- ⚠️ **Rage Click 목록**: 분노 클릭 발생 지점
- 🔍 **Dead Click 목록**: 반응 없는 클릭
- 📅 **날짜 필터**: 오늘/7일/30일
- 📊 **통계 요약**: 전체/페이지별 통계

---

## 🏗️ 아키텍처 설계

### 디렉토리 구조
```
src/
├── lib/
│   ├── analytics/
│   │   ├── tracker.ts           # 추적 스크립트 메인
│   │   ├── session.ts           # 세션 관리
│   │   ├── events.ts            # 이벤트 타입 정의
│   │   └── supabase-client.ts   # Supabase 클라이언트
│   └── analytics-types.ts       # 공통 타입
│
├── app/
│   ├── admin/
│   │   └── analytics/
│   │       ├── page.tsx         # 대시보드 메인
│   │       ├── components/
│   │       │   ├── Heatmap.tsx          # 히트맵
│   │       │   ├── ScrollMap.tsx        # 스크롤 맵
│   │       │   ├── RageClickList.tsx    # Rage 목록
│   │       │   ├── DeadClickList.tsx    # Dead 목록
│   │       │   ├── DateFilter.tsx       # 날짜 필터
│   │       │   └── StatsSummary.tsx     # 통계 요약
│   │       └── layout.tsx       # Admin 레이아웃
│   │
│   ├── api/
│   │   └── analytics/
│   │       ├── track/route.ts   # 이벤트 저장 API
│   │       └── query/route.ts   # 이벤트 조회 API
│   │
│   └── layout.tsx               # AnalyticsProvider 추가
│
└── components/
    └── analytics/
        └── AnalyticsScript.tsx  # 클라이언트 추적 컴포넌트
```

---

## 📊 데이터베이스 스키마 (Supabase)

### 테이블: `analytics_events`

```sql
CREATE TABLE analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 이벤트 정보
  event_type VARCHAR(50) NOT NULL,  -- 'click', 'scroll', 'rage_click', 'dead_click', 'page_view', 'page_leave'
  
  -- 페이지 정보
  page_url TEXT NOT NULL,
  page_title TEXT,
  
  -- 요소 정보 (클릭 이벤트)
  element_tag VARCHAR(50),
  element_class TEXT,
  element_id VARCHAR(255),
  element_text TEXT,
  
  -- 좌표 정보
  x_pos INTEGER,
  y_pos INTEGER,
  
  -- 스크롤 정보
  scroll_depth INTEGER,  -- 0-100 (percentage)
  scroll_y INTEGER,      -- 실제 픽셀 위치
  
  -- 세션 정보
  session_id UUID NOT NULL,
  
  -- 브라우저 정보
  user_agent TEXT,
  referrer TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  
  -- 타이밍 정보
  time_on_page INTEGER,  -- milliseconds
  
  -- 메타데이터
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 인덱스용
  INDEX idx_session (session_id),
  INDEX idx_event_type (event_type),
  INDEX idx_page_url (page_url),
  INDEX idx_created_at (created_at DESC)
);

-- RLS (Row Level Security) 정책
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 insert 가능 (추적용)
CREATE POLICY "Anyone can insert events" 
  ON analytics_events FOR INSERT 
  WITH CHECK (true);

-- 관리자만 조회 가능 (향후 auth 연동 시)
CREATE POLICY "Admins can view events" 
  ON analytics_events FOR SELECT 
  USING (true);  -- 현재는 모두 허용, 나중에 auth 추가
```

### 테이블: `analytics_sessions`

```sql
CREATE TABLE analytics_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  
  -- 세션 시작/종료
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration INTEGER,  -- seconds
  
  -- 첫 페이지 정보
  landing_page TEXT,
  referrer TEXT,
  
  -- 브라우저 정보
  user_agent TEXT,
  device_type VARCHAR(20),  -- 'desktop', 'mobile', 'tablet'
  
  -- 통계
  total_clicks INTEGER DEFAULT 0,
  total_page_views INTEGER DEFAULT 0,
  pages_visited INTEGER DEFAULT 0,
  
  INDEX idx_session_id (session_id),
  INDEX idx_started_at (started_at DESC)
);
```

---

## 🔧 구현 단계

### Phase 1: 기본 인프라 설정 (1-2시간)
1. ✅ Supabase 프로젝트 생성 및 연결
2. ✅ 테이블 생성 (analytics_events, analytics_sessions)
3. ✅ 환경 변수 설정 (.env.local)
4. ✅ Supabase 클라이언트 설정

### Phase 2: 추적 스크립트 구현 (2-3시간)
1. ✅ 세션 관리 (localStorage, 30분 만료)
2. ✅ 클릭 이벤트 추적
3. ✅ 스크롤 깊이 추적
4. ✅ Rage Click 탐지
5. ✅ Dead Click 탐지
6. ✅ 페이지 체류 시간 측정
7. ✅ 이벤트 전송 API 연동

### Phase 3: API 엔드포인트 (1시간)
1. ✅ POST /api/analytics/track - 이벤트 저장
2. ✅ GET /api/analytics/query - 이벤트 조회
3. ✅ 에러 핸들링 및 검증

### Phase 4: 관리자 대시보드 UI (3-4시간)
1. ✅ 대시보드 레이아웃 (`/admin/analytics`)
2. ✅ 날짜 필터 컴포넌트
3. ✅ 통계 요약 카드
4. ✅ 히트맵 시각화 (Canvas)
5. ✅ 스크롤 맵 차트
6. ✅ Rage/Dead Click 테이블

### Phase 5: 테스트 및 최적화 (1-2시간)
1. ✅ 성능 최적화 (debounce, throttle)
2. ✅ 배치 전송 (이벤트 묶어서 전송)
3. ✅ 에러 로깅
4. ✅ 크로스 브라우저 테스트

---

## 🎨 UI/UX 디자인 방향

### 기존 스타일 유지
- **컬러**: 현재 에디터의 다크 테마 유지
  - 배경: `#1a1a2e` (editor-bg)
  - 패널: `#16213e` (panel-bg)
  - 강조: `#00D4D4` (primary/cyan)
- **폰트**: Material Icons, 기존 타이포그래피
- **컴포넌트**: 기존 Button, Tooltip 스타일 재사용

### 대시보드 레이아웃
```
┌─────────────────────────────────────────────────┐
│  Admin > Analytics                     [Date▼]  │
├─────────────────────────────────────────────────┤
│  [Total]  [Clicks]  [Scrolls]  [Rage]  [Dead]  │  ← 통계 카드
├─────────────────────────────────────────────────┤
│                                                  │
│              Click Heatmap                       │  ← Canvas 히트맵
│          (페이지 스크린샷 + 오버레이)              │
│                                                  │
├─────────────────────────────────────────────────┤
│  Scroll Depth Distribution                      │  ← 바 차트
│  ████████████████░░░░ 80%                       │
├─────────────────────────────────────────────────┤
│  Rage Clicks (12)          Dead Clicks (5)      │  ← 테이블
└─────────────────────────────────────────────────┘
```

---

## 🔐 보안 & 프라이버시

### 데이터 수집 정책
- ✅ 개인 식별 정보(PII) 수집 안 함
- ✅ IP 주소 저장 안 함
- ✅ 쿠키 동의 배너 (선택사항)
- ✅ 데이터 익명화

### Supabase RLS 정책
- ✅ 이벤트 삽입: 모두 허용 (공개)
- ✅ 이벤트 조회: 관리자만 (나중에 인증 추가)

---

## 📦 필요한 패키지

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",  // Supabase 클라이언트
    "recharts": "^2.10.0",               // 차트 라이브러리 (옵션)
    // 기존 패키지 유지
  }
}
```

---

## 🚀 환경 변수

`.env.local`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Analytics 설정
NEXT_PUBLIC_ANALYTICS_ENABLED=true
NEXT_PUBLIC_ANALYTICS_SAMPLE_RATE=1.0  # 0.0-1.0 (샘플링 비율)
```

---

## 📝 구현 체크리스트

### 백엔드
- [ ] Supabase 프로젝트 생성
- [ ] 테이블 스키마 생성
- [ ] RLS 정책 설정
- [ ] API 라우트 구현
  - [ ] POST /api/analytics/track
  - [ ] GET /api/analytics/query

### 프론트엔드 - 추적
- [ ] 세션 관리 로직
- [ ] 클릭 이벤트 리스너
- [ ] 스크롤 이벤트 리스너
- [ ] Rage Click 탐지 알고리즘
- [ ] Dead Click 탐지
- [ ] 페이지 이탈 감지
- [ ] 이벤트 배치 전송

### 프론트엔드 - 대시보드
- [ ] Admin 레이아웃
- [ ] 날짜 필터
- [ ] 통계 카드
- [ ] 히트맵 (Canvas)
- [ ] 스크롤 맵 차트
- [ ] Rage/Dead 클릭 테이블
- [ ] 페이지 선택 드롭다운

### 최적화
- [ ] Debounce/Throttle 적용
- [ ] 배치 전송 (5초마다)
- [ ] IndexedDB 로컬 캐시 (옵션)
- [ ] 에러 핸들링

---

## 🎯 성능 고려사항

### 추적 스크립트 최적화
```typescript
// 1. Debounce: 스크롤 이벤트 (300ms)
// 2. Throttle: 마우스 이동 (500ms)
// 3. Batch: 5초마다 또는 10개 이벤트마다 전송
// 4. RequestIdleCallback: 유휴 시간에 전송
// 5. 샘플링: 100% 트래픽 추적 vs. 10% 샘플링
```

### 데이터베이스 최적화
```sql
-- 파티셔닝: 월별로 테이블 분할
CREATE TABLE analytics_events_2024_02 
  PARTITION OF analytics_events 
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- 자동 정리: 90일 이후 데이터 삭제
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  DELETE FROM analytics_events 
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
```

---

## 🔄 향후 확장 가능성

### Phase 6: 고급 기능 (Optional)
1. 🎥 **세션 리플레이**: rrweb 라이브러리 활용
2. 📱 **모바일 vs 데스크톱** 분석
3. 🌐 **A/B 테스트** 지원
4. 📧 **알림**: Rage Click 임계값 도달 시 이메일
5. 📤 **내보내기**: CSV/JSON 다운로드
6. 🔗 **UTM 파라미터** 추적
7. 👤 **사용자 인증** 연동 (optional)

---

## 🧪 테스트 시나리오

### 추적 스크립트
1. ✅ 페이지 로드 → page_view 이벤트 발생
2. ✅ 버튼 클릭 → click 이벤트 + 좌표 기록
3. ✅ 50% 스크롤 → scroll 이벤트 (depth: 50)
4. ✅ 같은 버튼 3회 연타 → rage_click 이벤트
5. ✅ 30분 대기 → 세션 만료 → 새 세션 생성
6. ✅ 페이지 이탈 → page_leave + 체류 시간

### 대시보드
1. ✅ 날짜 필터 변경 → 데이터 리로드
2. ✅ 히트맵 렌더링 → 클릭 밀도 시각화
3. ✅ Rage Click 목록 → 상위 5개 표시
4. ✅ 빈 데이터 → "No data" 메시지

---

## 💡 구현 우선순위

### 🔥 High Priority (MVP)
1. 기본 클릭/스크롤 추적
2. Supabase 연동
3. 간단한 대시보드 (히트맵 + 통계)

### 🟡 Medium Priority
1. Rage/Dead Click 탐지
2. 스크롤 맵 차트
3. 날짜 필터

### 🟢 Low Priority (Nice to have)
1. 세션 리플레이
2. CSV 내보내기
3. 실시간 대시보드

---

## 📚 참고 자료

- [rrweb (세션 리플레이)](https://github.com/rrweb-io/rrweb)
- [Supabase Docs](https://supabase.com/docs)
- [Canvas Heatmap 예제](https://www.patrick-wied.at/static/heatmapjs/)
- [Web Analytics Best Practices](https://web.dev/vitals/)

---

## 🎬 시작 단계

1. **Supabase 프로젝트 생성** → 완료 후 URL/Key 받기
2. **환경 변수 설정** → `.env.local` 추가
3. **패키지 설치** → `npm install @supabase/supabase-js`
4. **테이블 생성** → SQL 쿼리 실행
5. **추적 스크립트 구현** → Phase 2 시작

---

**✅ 기획 완료 - 구현 준비 완료**

이제 단계별로 구현을 시작할 수 있습니다. 어느 단계부터 시작하시겠습니까?
