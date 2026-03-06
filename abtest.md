## a/b test 분석 (gemini)

현재 어드민 페이지(A/B 테스트 대시보드)에서 A/B 테스트 기능이 제대로 작동하지 않고 "활성화된 실험이 없습니다." 등으로 나타나는 원인을 코드(`src/lib/analytics/store.ts`, `ab-experiments.ts`, `ab-test.ts` 등)를 바탕으로 분석한 결과입니다. 크게 세 가지 주요 원인이 파악되었습니다.

### 1. 실험 데이터가 0건일 때 대시보드에 노출되지 않는 로직 (가장 유력한 버그)
* **원인:** `src/lib/analytics/store.ts` 파일의 `getABExperimentResults()` 함수를 보면, 실험 목록을 불러올 때 `ab_experiments`(실험 설정 테이블)를 조회하지 않고, **`ab_events`(유저의 노출/클릭 이벤트 테이블)**만 조회하여 실험별 결과를 그룹화하고 있습니다.
* **문제:** 관리자 페이지에서 '새 실험 생성'을 통해 버튼이나 텍스트를 등록했더라도, **아직 방문자가 한 명도 없어서 이벤트(impression)가 찍히지 않았다면** 대시보드에 그 실험 자체가 나타나지 않습니다.
* **해결책:** `ab_experiments` 테이블에서 진행 중인 실험 목록을 기본으로 불러온 뒤, `ab_events`의 집계 결과를 조인(Join)하여 매핑하도록 로직을 수정해야 합니다. 그래야 조회수가 0이어도 리스트에 등장합니다.

### 2. Supabase DB 세팅 및 환경변수 문제 
* **원인:** `.env.local` 파일에 `NEXT_PUBLIC_SUPABASE_URL` 및 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 값이 비어있을 경우 (혹은 잘못된 값일 경우), `supabase.ts`의 `getSupabase()` 함수가 클라이언트를 초기화하지 못하고 `null`을 반환합니다.
* **문제:** 이 경우 `ab-test.ts`에서 A/B 테스트 이벤트를 백엔드(`track-ab` 라우트)로 보내더라도 무시되거나 에러가 생기며, 어드민에서 결과를 불러올 때도 빈 배열(`[]`)이 반환됩니다. 또한, Supabase 프로젝트 내에 `ab_experiments`와 `ab_events` 테이블 자체가 생성되어 있지 않을 경우 500 에러를 뱉게 됩니다.
* **해결책:** 
    1. Supabase 접속 정보가 잘 입력되어 있는지 `.env.local`를 확인합니다.
    2. Supabase SQL 에디터에서 해당 테이블들(`ab_events`, `ab_experiments`)이 올바른 스키마로 존재(혹은 생성)하는지 점검해야 합니다.

### 3. 어드민 페이지 내 트래킹 무시 조건
* **원인:** 유저의 요청에서 "admin page에 a/b테스트 기능을 넣었는데" 라고 하셨을 때, A/B 테스트 실험 UI 요소를 일반 랜딩페이지가 아닌 `/admin/...` 내부에 넣으셨을 가능성이 있습니다.
* **문제:** 현재 애널리틱스 구조상 `AnalyticsProvider`나 데이터 호출부(예: `getDistinctPages`)에서 `/admin/%` 경로를 애널리틱스 통계에서 의도적으로 배제시키는 방어 로직들이 존재합니다.
* **해결책:** A/B 테스트 대상(`data-ab-test` 속성이 부여된 HTML 엘리먼트)이 관리자 페이지 내부에 있다면 노출과 클릭이 정상 수집되지 않거나 실험 세팅이 작동하지 않을 가능성이 높습니다. 테스트 대상 요소는 반드시 실제 고객용 라우트(`src/app/page.tsx` 등)에 배치해야 합니다.

---
**[요약 요처 액션 아이템]**
1. `.env.local` 환경 변수에 Supabase Key를 정상 등록했는지 확인
2. Supabase 내에 A/B 테스트 관련 테이블(`ab_experiments`, `ab_events`) 구축 여부 확인
3. `store.ts`의 데이터 병합 방식 수정 (`ab_experiments` 테이블 기준 데이터 맵핑으로 개편)
