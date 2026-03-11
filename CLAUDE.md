# Project Engineering Rules (Next.js / TypeScript)

## Stack
- Next.js 16 App Router + Turbopack
- TypeScript (strict)
- Supabase (analytics_events, ab_experiments, ab_events, page_views)
- Tailwind CSS

## Architecture

```
src/
  app/          # Next.js pages & API routes (presentation layer)
  components/   # Reusable UI components — NO business logic
  lib/          # Core logic: analytics, ab-test, supabase clients
```

**Dependency rule**: `app/` → `lib/` only. `lib/` has zero dependency on UI.

## Code Standards

1. **File size**: > 250줄이면 분리. 컴포넌트는 단일 책임.
2. **No magic strings/numbers**: 상수나 enum 사용.
3. **Explicit over implicit**: 함수명은 동작을 명확히 설명 (`getDistinctPages` not `getPages`).
4. **Immutability**: `const` 우선. 상태 변경은 명시적으로.
5. **Error handling**: try-catch는 흐름 제어에 사용 금지. 에러는 반환값으로 명시 (`{ error: string } | Data`).
6. **No business logic in components**: 계산/집계 로직은 `lib/`로.

## Naming Conventions
- Components: PascalCase (`HeatmapTab`, `KPICard`)
- Hooks/utils: camelCase (`useABTest`, `getDistinctPages`)
- API routes: kebab-case (`/api/ab-experiments/list`)
- DB columns: snake_case → JS: camelCase 변환 명시

## Key Files
- `src/lib/analytics/store.ts` — 모든 analytics 쿼리 함수
- `src/lib/analytics/ab-test.ts` — cookie 기반 A/B 분배
- `src/lib/analytics/ab-experiments.ts` — impression/click 이벤트 추적
- `src/app/admin/analytics/page.tsx` — 메인 analytics 대시보드
- `src/app/admin/experiments/page.tsx` — A/B 테스트 대시보드
- `src/app/api/analytics/query/route.ts` — analytics API 진입점
- `src/middleware.ts` — ADMIN_EMAILS 기반 /admin/* 접근 제한
