# Sprint 6 Shared Foundation — Final Regression Gate

## Metadata

- Date: 2026-08-05
- Branch: `refactor/sprint6-shared-foundation`
- HEAD: `57d96f2a9905456fdd2f5d1c2094ac62b26053ed`
- Merge base used for branch audit: `b66ea99f8b35e749607fa4709429d01937e2dd79` (`develop`, `origin/develop`)
- Gate result: `MERGE GATE: BLOCKED`

## Scope

T24 performed the final regression gate for the Sprint 6 shared foundation branch. No product code was modified during T24. The only file created by T24 is this closing document.

## T1 Baseline

| Area | T1 |
| --- | ---: |
| Frontend tests | 42 files, 457 passed, 0 failed, 0 skipped |
| Backend tests | 62 files total, 60 passed, 2 skipped; 1225 passed, 10 skipped, 0 failed |
| PostgreSQL legacy integration | `roles-participation.integration.spec.ts`, 7 skipped via `ROLES_IT_DATABASE_URL` |

Line baseline:

| File | T1 |
| --- | ---: |
| `project-detail-client.tsx` | 661 |
| `my-project-view-client.tsx` | 999 |
| `proyectos/[id]/page.tsx` | 463 |
| `kanban-workspace-client.tsx` | 584 |

## Foundation Changes

- Frontend refactor: shared project detail sections and member query contracts.
- Frontend tests: project detail, my project current/snapshot, and member query contract.
- Backend integration harness: gated PostgreSQL client, fixtures, cleanup, partial-index invariant specs, and cleanup isolation spec.
- Prisma documentation: partial unique index invariants documented in `schema.prisma`.
- Docs: manual regression walkthrough and this final regression gate.

## Directed Regression

### Project Detail

Command:

```bash
cd apps/frontend
npx vitest run test/project-detail-leader.spec.ts test/project-detail-view.spec.ts test/project-detail-task-navigation.spec.ts
```

Result:

| Test Files | Tests | Failed |
| ---: | ---: | ---: |
| 3 passed | 26 passed | 0 |

Complementary roles coverage:

```bash
npx vitest run test/project-roles-sheet.spec.ts test/role-admin-card.spec.ts
```

| Test Files | Tests | Failed |
| ---: | ---: | ---: |
| 2 passed | 21 passed | 0 |

### My Project Current vs Snapshot

Command:

```bash
npx vitest run test/my-project-view.spec.tsx
```

| Test Files | Tests | Failed |
| ---: | ---: | ---: |
| 1 passed | 6 passed | 0 |

Coverage remains focused on current to snapshot, snapshot to current, missing snapshot, comments, optional values, and empty roles.

### Member Query Contract

Command:

```bash
npx vitest run test/use-project-members.spec.ts
```

| Test Files | Tests | Failed |
| ---: | ---: | ---: |
| 1 passed | 12 passed | 0 |

The modern and legacy paths both preserve the effective runtime key `['proyecto-equipo', 42]`.

### PostgreSQL Invariants

Command:

```bash
cd apps/backend
npx vitest run test/integration/partial-index-invariants.integration.spec.ts test/integration/harness-isolation.integration.spec.ts
```

`INTEGRATION_DATABASE_URL: NOT SET`.

| Test Files | Tests | Failed | Skipped |
| ---: | ---: | ---: | ---: |
| 2 skipped | 4 skipped | 0 | 4 |

### Harness Isolation

The harness isolation spec is present and structurally covered by T23.B, but did not execute against PostgreSQL real in T24 because `INTEGRATION_DATABASE_URL` was not set.

## Full Regression

### Frontend

Official script:

```bash
cd apps/frontend
npm test
```

| Test Files | Tests | Passed | Failed | Skipped |
| ---: | ---: | ---: | ---: | ---: |
| 43 passed | 475 | 475 | 0 | 0 |

Coverage count moved from 457 passed at T1 to 475 passed final. More tests alone are not proof of quality; the meaningful improvement is explicit coverage of project detail, current/snapshot behavior, and member query contract.

### Backend

Official script:

```bash
cd apps/backend
npm test
```

| Test Files | Tests | Passed | Failed | Skipped |
| ---: | ---: | ---: | ---: | ---: |
| 60 passed, 4 skipped (64) | 1239 | 1225 | 0 | 14 |

Compared with T1: passed tests remain 1225, skipped tests moved from 10 to 14 because the new PostgreSQL integration specs are gated and `INTEGRATION_DATABASE_URL` is not set.

### Lint

Directed frontend lint over touched/relevant files:

| Errors | Warnings |
| ---: | ---: |
| 0 | 0 |

Directed backend lint over integration harness files:

| Errors | Warnings |
| ---: | ---: |
| 0 | 0 |

Global official lint was also sampled for status:

| Area | Result | Classification |
| --- | --- | --- |
| Frontend global `npm run lint` | 3 errors, 1 warning | PREEXISTING, outside touched directed files |
| Backend global `npm run lint` | 3 errors, 778 warnings | PREEXISTING, outside touched directed files |

### Typecheck

- FRONTEND TYPECHECK OFICIAL: NO DISPONIBLE
- BACKEND TYPECHECK OFICIAL: NO DISPONIBLE

No ad-hoc `tsc` command was executed. The frontend production build did run its built-in TypeScript phase successfully.

### Builds

Frontend:

- First sandboxed attempt failed while fetching Google Fonts (`Inter`, `Manrope`) from `fonts.googleapis.com`.
- Re-run with network access completed successfully.
- BUILD FRONTEND: PASS

Backend:

- Official command: `npm run build`
- BUILD BACKEND: PASS

Builds did not modify tracked files.

## Manual Gate

- T19 manual: PASS (`A-G: PASS`, regressions: 0)
- T22.B legacy component regression: PASS

The T22.B product touch was limited to the legacy team query key and is covered by `use-project-members.spec.ts`.

## Final Metrics

| Archivo | T1 | Final | Cambio |
| --- | ---: | ---: | ---: |
| `project-detail-client.tsx` | 661 | 293 | -368 |
| `my-project-view-client.tsx` | 999 | 857 | -142 |
| `proyectos/[id]/page.tsx` | 463 | 463 | 0 |
| `kanban-workspace-client.tsx` | 584 | 584 | 0 |

## PostgreSQL Real Validation

POSTGRESQL REAL VALIDADO: NO

Pending:

- `participacion_proyecto_activa_unique`
- `asignacion_tarea_activa_unique`
- harness cleanup isolation

Reason:

`INTEGRATION_DATABASE_URL NOT SET`

Consequences:

- INVARIANTE PARTICIPACION VALIDADA EN DB REAL: NO
- INVARIANTE ASIGNACION VALIDADA EN DB REAL: NO
- AISLAMIENTO VALIDADO EN DB REAL: NO
- POSTGRESQL REAL PENDIENTE PARA GATE FINAL T24: SI

## Git Scope Audit

Merge base: `b66ea99f8b35e749607fa4709429d01937e2dd79` (`develop`, `origin/develop`).

Commits audited from base to HEAD:

- `9fbec92` docs(prisma): document partial unique index invariants
- `89bde38` refactor(frontend): centralize project members query key
- `f2bc20e` refactor(frontend): centralize project member DTOs
- `3c70e46` refactor(frontend): extract project summary section from detail view
- `ccb470b` refactor(frontend): extract closure request section from detail view
- `e5c42e5` refactor(frontend): extract objectives section from detail view
- `52de392` refactor(frontend): extract role management section from detail view
- `83f4c3a` refactor(frontend): extract remaining detail sections and finalize orchestrator
- `ccae585` refactor(frontend): extract shared general-info section for project view
- `00b63c9` refactor(frontend): extract shared roles-and-skills section for project view
- `f2aa2b4` refactor(frontend): deduplicate snapshot project detail sections
- `3080b36` docs(frontend): mark legacy team view for HU-123 replacement
- `2fe589b` test(integration): add PostgreSQL connection and gating module
- `a73e74a` test(integration): add fixture helpers for the PostgreSQL test harness
- `91bfde4` test(integration): add FK-safe cleanup helpers for PostgreSQL harness
- `e499099` test(integration): add smoke test for PostgreSQL partial unique index
- `1d022c0` docs(architecture): record manual regression walkthrough for foundation
- `bb36795` test(frontend): strengthen project detail regression coverage
- `fd0bf7a` test(frontend): cover project view and snapshot regressions
- `1fed381` fix(frontend): align legacy team query key with shared member contract
- `57d96f2` test(integration): cover existing PostgreSQL data invariants

Diff categories:

- frontend refactor: project detail/client decomposition and member query utilities
- frontend tests: project detail, my project, member query contract
- backend integration harness: database gate, fixtures, cleanup, invariant and isolation specs
- Prisma documentation: `schema.prisma` invariant comments
- docs: manual and final regression records

No `.claude/`, `.codex/`, `.env`, `.env.*`, or lockfile changes appear in the branch diff. Current working tree contains `.claude/` as untracked and unstaged.

## Findings

- No automated regression found in directed tests, full frontend tests, full backend tests, directed lint, or builds.
- Global lint failures remain present outside the directed touched files and are classified as preexisting debt under the T1 lint baseline.
- The first frontend build attempt was blocked by sandbox/network access to Google Fonts; the re-run with network access passed.

## Outstanding Warnings

- PostgreSQL real validation for the new harness/invariant suites has not executed because `INTEGRATION_DATABASE_URL` is not set.
- Legacy PostgreSQL role integration remains skipped because `ROLES_IT_DATABASE_URL` is not set, matching the known baseline behavior.

## Merge Gate

MERGE GATE: BLOCKED

RAMA LISTA PARA MERGE: NO

Reason:

PostgreSQL real del harness/invariantes todavia no fue ejecutado.
