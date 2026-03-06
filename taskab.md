# A/B 테스트 개선 작업 목록 (taskab.md)

## [/] Phase 1: 파운데이션 점검
- [/] `.env.local`의 Supabase 환경변수 재확인 및 유효성 테스트
- [/] Supabase SQL Editor를 통해 테이블 스키마 재검증 (`ab_experiments`, `ab_events`)

## [x] Phase 2: 백엔드 로직 수정
- [x] `src/lib/analytics/store.ts` 수정: `ab_experiments` 기준 데이터 병합 로직 구현
- [x] `src/lib/analytics/supabase.ts` 수정: 연결 실패 시 에러 핸들링 고도화

## [x] Phase 3: 프론트엔드 및 트래킹 수정
- [x] `src/components/analytics/AnalyticsProvider.tsx` 내 경로 필터 확인 및 수정
- [x] 대시보드(`src/app/admin/experiments/page.tsx`)에 데이터 전무 시 상태 표시 UI 추가

## [/] Phase 4: 최종 테스트 및 검증
- [ ] 신규 실험 생성 테스트 (이름: `UX_Test_01`)
- [ ] 실제 페이지 방문 및 로그 적재 테스트
- [ ] 대시보드 수치 업데이트 확인
- [ ] `planab.md`에 명시된 시나리오별 검증 완료
