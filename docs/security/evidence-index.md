# Índice de evidencia OWASP 2025 (código)

Cadena auditable de la workstream OWASP de la Fase 2 (Vernel): **control → gate/commit → test → evidencia → estado**. Control: **OWASP25-C048** · tarea **T-273**.

- Base de la fase (`BASE_SHA_PHASE2_CODE`): `0a723a8d93b6`, padre local del primer commit de G01. Rango: `0a723a8d93b6..HEAD` de `sprint8/vernel-owasp2025`.
- Los SHA son los del historial local; el ID estable `Gxx-Cnn` va en el tercer bloque de cada mensaje (`Security/integration contract: Gate Gxx · Commit Gxx-Cnn · …`).
- «Resultado» es el conteo actual de tests de esos archivos en la regresión local de G08 (todos verdes). La evidencia es local y reproducible: no depende de producción, de `main`, de un deploy ni de corridas remotas.
- «Auditoría» nombra la auditoría del gate (documento externo al repositorio, no versionado).
- Estados: ver `owasp-top10-2025.md`. Lo que requiere administración figura como `OUT_OF_SCOPE_ADMIN_HANDOFF`.

## G01 — Secrets & Configuration Fail-Closed

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G01-C01 | `79230ea7` | OWASP25-C019 | A07 | `g01-synthetic-jwt-environment.spec.ts`, `s7-cloudinary-adapter.spec.ts`, `s7-environment.spec.ts`, `security-jwt.spec.ts` | `cd apps/backend && npx vitest run test/g01-synthetic-jwt-environment.spec.ts test/s7-cloudinary-adapter.spec.ts test/s7-environment.spec.ts test/security-jwt.spec.ts` | PASS · 23 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C02 | `f5826dd6` | OWASP25-C019 | A07 | `jwt-secret-config.spec.ts` | `cd apps/backend && npx vitest run test/jwt-secret-config.spec.ts` | PASS · 18 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C03 | `f58300b7` | OWASP25-C019 + conserva C003 | A07 | `g01-jwt-secret-readers.spec.ts` | `cd apps/backend && npx vitest run test/g01-jwt-secret-readers.spec.ts` | PASS · 11 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C04 | `d312b5c0` | OWASP25-C019 | A07 | `g01-jwt-secret-readers.spec.ts` | `cd apps/backend && npx vitest run test/g01-jwt-secret-readers.spec.ts` | PASS · 11 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C05 | `c15edfef` | OWASP25-C019 + VM0-F018/F022 | A02/A08 | `g01-compose-contract.spec.ts` | `cd apps/backend && npx vitest run test/g01-compose-contract.spec.ts` | PASS · 10 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C06 | `5824450a` | OWASP25-C020 | A02/A08 | `g01-frontend-image-secrets.spec.ts` | `cd apps/backend && npx vitest run test/g01-frontend-image-secrets.spec.ts` | PASS · 7 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C07 | `90398db6` | FASE2-N01 + VM0-F012 + C030 | A02/A08 | `g01-deploy-env-transport.spec.ts` | `cd apps/backend && npx vitest run test/g01-deploy-env-transport.spec.ts` | PASS · 6 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C08 | `a5408ae3` | OWASP25-C030 + VM0-F019 | A04/A08 | `g01-deploy-config-contract.spec.ts` | `cd apps/backend && npx vitest run test/g01-deploy-config-contract.spec.ts` | PASS · 25 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C09 | `910308d8` | OWASP25-C029 | A04/A08 | `g01-backend-startup.spec.ts` | `cd apps/backend && npx vitest run test/g01-backend-startup.spec.ts` | PASS · 3 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C10 | `b7ddad18` | OWASP25-C030 | A04 | `controllers-and-basic.spec.ts` | `cd apps/backend && npx vitest run test/controllers-and-basic.spec.ts` | PASS · 4 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C11 | `6363063a` | FASE2-N08 | A02/A08 | `g01-gitignore-contract.spec.ts` | `cd apps/backend && npx vitest run test/g01-gitignore-contract.spec.ts` | PASS · 19 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |
| G01-C12 | `1542a18d` | OWASP25-C019/C030 + FASE2-N13 | A02/A04 | `g01-env-example-contract.spec.ts` | `cd apps/backend && npx vitest run test/g01-env-example-contract.spec.ts` | PASS · 7 tests | auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md §12 | RB-CODE | PASS |

## G02 — CI/CD Integrity (alcance v2)

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G02-C01 | `31093340` | OWASP25-C044/C045 + N-03/T23 | A08 | `security-deploy-ref-guard.spec.ts` | `cd apps/backend && npx vitest run test/security-deploy-ref-guard.spec.ts` | PASS · 4 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C02 | `615349a0` | OWASP25-C044 | A08 | `g02-workflow-permissions.spec.ts` | `cd apps/backend && npx vitest run test/g02-workflow-permissions.spec.ts` | PASS · 6 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C03 | — | OWASP25-C045 + FASE2-N14 | A08 | No ejecutada por Vernel: vincular el job productivo al environment `production` requiere GitHub Admin | — | — | auditoria_gate_G02_cicd_integrity.md §5 | — | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G02-C04 | `3aac8d12` | OWASP25-C035 | A08 | `g02-publish-gate.spec.ts`, `g02-workflow-permissions.spec.ts`, `security-deploy-ref-guard.spec.ts` | `cd apps/backend && npx vitest run test/g02-publish-gate.spec.ts test/g02-workflow-permissions.spec.ts test/security-deploy-ref-guard.spec.ts` | PASS · 15 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C05 | `24d732fa` | VM0-F020 | A08 | `g02-deploy-dirty-checkout.spec.ts` | `cd apps/backend && npx vitest run test/g02-deploy-dirty-checkout.spec.ts` | PASS · 4 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C06 | `3acd03ec` | FASE2-N07 | A08 | `g02-deploy-config-only.spec.ts`, `g02-workflow-permissions.spec.ts` | `cd apps/backend && npx vitest run test/g02-deploy-config-only.spec.ts test/g02-workflow-permissions.spec.ts` | PASS · 22 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C07 | `3eef682a` | FASE2-N07 | A08 | `g02-deploy-config-only.spec.ts`, `g02-immutable-variants.spec.ts`, `g02-publish-gate.spec.ts`, `security-deploy-ref-guard.spec.ts` | `cd apps/backend && npx vitest run test/g02-deploy-config-only.spec.ts test/g02-immutable-variants.spec.ts test/g02-publish-gate.spec.ts test/security-deploy-ref-guard.spec.ts` | PASS · 37 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C08 | `5339b893` | OWASP25-C031 + FASE2-N05 | A08 | lint del frontend 4 → 0 errores | `cd apps/frontend && npm run lint` | PASS | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C09 | `22a9da35` | OWASP25-C031 | A08 | `g02-ci-quality-gates.spec.ts` | `cd apps/backend && npx vitest run test/g02-ci-quality-gates.spec.ts` | PASS · 15 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C10 | `dbec7418` | OWASP25-C043 | A08 | `g02-ci-quality-gates.spec.ts`, `my-project-view.spec.tsx`, `theme-tokens.spec.ts` | `cd apps/backend && npx vitest run test/g02-ci-quality-gates.spec.ts`<br>`cd apps/frontend && npx vitest run test/my-project-view.spec.tsx test/theme-tokens.spec.ts` | PASS · 30 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C11 | `57e58a2a` | OWASP25-C043 | A08 | `g02-ci-quality-gates.spec.ts` | `cd apps/backend && npx vitest run test/g02-ci-quality-gates.spec.ts` | PASS · 15 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C12 | `d50349d1` | OWASP25-C032 | A08 | `g02-ci-quality-gates.spec.ts` | `cd apps/backend && npx vitest run test/g02-ci-quality-gates.spec.ts` | PASS · 15 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C13 | `eed73d2b` | OWASP25-C033 + FASE2-N06 | A08 | `g02-e2e-trigger-contract.spec.ts` | `cd apps/backend && npx vitest run test/g02-e2e-trigger-contract.spec.ts` | PASS · 12 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C14 | `f0df7445` | OWASP25-C033 | A08 | `g02-e2e-production-like.spec.ts` | `cd apps/backend && npx vitest run test/g02-e2e-production-like.spec.ts` | PASS · 4 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C15 | `ea72f90d` | OWASP25-C034 | A08 | `g02-real-db-integration.spec.ts` | `cd apps/backend && npm run test:integration` (PostgreSQL desechable) | PASS · 5 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C16 | `7d4a338c` | OWASP25-C047 | A02/A08 | `g02-nginx-baseline.spec.ts` | `cd apps/backend && npx vitest run test/g02-nginx-baseline.spec.ts` | PASS · 10 tests | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C17 | `4436aba6` | D4 + OWASP25-C043/C047 | A08 | `g02-topology-harness.spec.ts` + arnés | `cd apps/backend && npx vitest run test/g02-topology-harness.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 12 tests + arnés | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |
| G02-C18 | `da63a766` | OWASP25-C043/C044 + D4 | A08 | `g02-topology-ci.spec.ts` + arnés | `cd apps/backend && npx vitest run test/g02-topology-ci.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 22 tests + arnés | auditoria_gate_G02_cicd_integrity.md §4 | RB-CODE | PASS |

## G03 — Supply Chain & Dependency Security

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G03-C01 | `dfbba55e` | OWASP25-C041 | A03/A10 | `g03-dependency-review.spec.ts` | `cd apps/backend && npx vitest run test/g03-dependency-review.spec.ts` | PASS · 10 tests | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C02 | `6cf2dacc` | OWASP25-C040 | A03/A10 | `g03-npm-audit-summary.spec.ts` | `cd apps/backend && npx vitest run test/g03-npm-audit-summary.spec.ts` | PASS · 15 tests | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C03 | `7ab63779` | OWASP25-C042 | A03/A10 | eliminado en commit b9c3b183 (develop): Dependabot y su prueba se retiraron | — | PASS · 6 tests (histórico, hasta b9c3b183) | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C04 | `db3c9370` | OWASP25-C028 | A03/A10 | 0 consumidores de `xlsx`; lockfile reducido; `npm ci` reproducible | `cd apps/frontend && npm ci && npm run build` | PASS | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C05 | `3a817f90` | OWASP25-C028 | A03/A10 | 0 consumidores de `jspdf`/`dompurify` en el frontend; `npm ci` reproducible | `cd apps/frontend && npm ci && npm run build` | PASS | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C06 | `56d8b2b3` | OWASP25-C028 + FASE2-N15 | A03/A10 | 0 consumidores de `resend`; `npm ci` reproducible | `cd apps/backend && npm ci && npm run build` | PASS | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C07 | `c5527a00` | OWASP25-C028 | A03/A10 | Next 16.3.6; build y E2E iguales al baseline | `cd apps/frontend && npm run build` | PASS | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C08 | `4ce5705b` | OWASP25-C028 | A03/A10 | `npm audit --omit=dev` del frontend en 0 | `cd apps/frontend && npm audit --omit=dev` | PASS | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C09 | `7d8b8e75` | OWASP25-C028 | A03/A10 | `npm audit fix` sin `--force`; familia Nest alineada | `cd apps/backend && npm audit --omit=dev` | PASS | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C10 | `7b3c8272` | OWASP25-C059 reevaluado | A03/A10 | `g03-jspdf-remediation.spec.ts`, `pdf-export.builder.spec.ts` | `cd apps/backend && npx vitest run test/g03-jspdf-remediation.spec.ts test/pdf-export.builder.spec.ts` | PASS · 29 tests | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |
| G03-C11 | `f8094596` | OWASP25-C040/C046 | A03/A10 | `g03-dependency-exceptions.spec.ts` | `cd apps/backend && npx vitest run test/g03-dependency-exceptions.spec.ts` | PASS · 7 tests | auditoria_gate_G03_supply_chain.md §15 | RB-CODE | PASS |

## G04 — Authentication / Rate Limiting / Account Hardening

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G04-C01 | `58f9b311` | OWASP25-C022 | A07 | `g04-register-throttle.spec.ts` | `cd apps/backend && npx vitest run test/g04-register-throttle.spec.ts` | PASS · 3 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C02 | `a4a529ff` | OWASP25-C023 | A07 | `g04-login-equal-work.spec.ts` | `cd apps/backend && npx vitest run test/g04-login-equal-work.spec.ts` | PASS · 3 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C03 | `5266c165` | OWASP25-C023 + conserva C002 | A07 | `auth.service.spec.ts`, `g01-jwt-secret-readers.spec.ts`, `g04-active-only-tokens.spec.ts`, `security-jwt.spec.ts` | `cd apps/backend && npx vitest run test/auth.service.spec.ts test/g01-jwt-secret-readers.spec.ts test/g04-active-only-tokens.spec.ts test/security-jwt.spec.ts` | PASS · 41 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C04 | `db4c70d7` | OWASP25-C024 | A07 | `g04-reset-atomic.spec.ts`, `password-recovery-admin.e2e.spec.ts`, `password-recovery-admin.real-db.e2e.spec.ts` | `cd apps/backend && npx vitest run test/g04-reset-atomic.spec.ts test/password-recovery-admin.e2e.spec.ts`<br>`cd apps/backend && npm run test:integration` (PostgreSQL desechable) | PASS · 13 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C05 | `a7a5904e` | OWASP25-C036 | A07 | `g04-account-attempts.spec.ts` | `cd apps/backend && npx vitest run test/g04-account-attempts.spec.ts` | PASS · 8 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C06 | `1ce3b370` | OWASP25-C036 | A07 | `g04-account-lockout.spec.ts` | `cd apps/backend && npx vitest run test/g04-account-lockout.spec.ts` | PASS · 7 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C07 | `f6354fbb` | OWASP25-C036/C014 | A07 | `g04-recovery-bound.spec.ts` | `cd apps/backend && npx vitest run test/g04-recovery-bound.spec.ts` | PASS · 5 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C08 | `5191aab5` | OWASP25-C021 + D2 | A07/A10 | `g01-deploy-env-transport.spec.ts`, `g04-trust-proxy.spec.ts`, `s7-environment.spec.ts` | `cd apps/backend && npx vitest run test/g01-deploy-env-transport.spec.ts test/g04-trust-proxy.spec.ts test/s7-environment.spec.ts` | PASS · 27 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C09 | `307fab6e` | OWASP25-C021/C022/C036 + T15 | A07 | `security-rate-limiting.spec.ts` | `cd apps/backend && npx vitest run test/security-rate-limiting.spec.ts` | PASS · 16 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C10 | `890dd44e` | OWASP25-C021 + P5/T19 | A10 | `security-exposed-ports.spec.ts` | `cd apps/backend && npx vitest run test/security-exposed-ports.spec.ts` | PASS · 15 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C11 | `c2d054d5` | OWASP25-C021 + P1/T13 | A10/A07 | `g02-nginx-baseline.spec.ts`, `g02-topology-harness.spec.ts` + arnés | `cd apps/backend && npx vitest run test/g02-nginx-baseline.spec.ts test/g02-topology-harness.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 22 tests + arnés | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C12 | `61f6f339` | P1/T13 | A07/A10 | `g04-topology-t13.spec.ts` + arnés | `cd apps/backend && npx vitest run test/g04-topology-t13.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 6 tests + arnés | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C13 | `31df22e3` | OWASP25-C021 + T16 | A07/A10 | `g04-xff-spoof.spec.ts` + arnés | `cd apps/backend && npx vitest run test/g04-xff-spoof.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 3 tests + arnés | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |
| G04-C14 | `6c7a5351` | OWASP25-C021 | A07/A10 | `api-proxy-xff.spec.ts` | `cd apps/frontend && npx vitest run test/api-proxy-xff.spec.ts` | PASS · 3 tests | auditoria_gate_G04_auth_rate_limit_hardening.md §25 | RB-CODE | PASS |

## G06 — HTTP Security Headers / CSP / HTTPS

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G06-C01 | `2152afe7` | OWASP25-C039 | A05/A02 | `security-headers-contract.spec.ts` | `cd apps/frontend && npx vitest run test/security-headers-contract.spec.ts` | PASS · 19 tests | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C02 | `b61adc64` | OWASP25-C039 | A05/A02 | `security-headers-contract.spec.ts` + arnés | `cd apps/frontend && npx vitest run test/security-headers-contract.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 19 tests + arnés | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C03 | `4ed923ef` | OWASP25-C039 | A05 | `security-headers-contract.spec.ts` + arnés | `cd apps/frontend && npx vitest run test/security-headers-contract.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 19 tests + arnés | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C04 | `52a08abd` | OWASP25-C039 | A05 | `csp-policy.spec.ts` | `cd apps/frontend && npx vitest run test/csp-policy.spec.ts` | PASS · 9 tests | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C05 | `2416e7e3` | OWASP25-C039 | A05 | `g01-frontend-image-secrets.spec.ts`, `g02-immutable-variants.spec.ts`, `g06-csp-mode-deploy.spec.ts`, `csp-mode.spec.ts` | `cd apps/backend && npx vitest run test/g01-frontend-image-secrets.spec.ts test/g02-immutable-variants.spec.ts test/g06-csp-mode-deploy.spec.ts`<br>`cd apps/frontend && npx vitest run test/csp-mode.spec.ts` | PASS · 41 tests | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C06 | `18f28ed8` | NBD-1 + C008 | A02 | `g06-hsts.spec.ts`, `security-rate-limiting.spec.ts` | `cd apps/backend && npx vitest run test/g06-hsts.spec.ts test/security-rate-limiting.spec.ts` | PASS · 25 tests | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-NOT-AVAILABLE para efecto navegador; RB-CODE para config | PASS |
| G06-C07 | `9a2d8f66` | OWASP25-C049 parcial | A02/A07 | `g06-cookie-secure.spec.ts`, `security-exposed-ports.spec.ts` | `cd apps/backend && npx vitest run test/g06-cookie-secure.spec.ts test/security-exposed-ports.spec.ts` | PASS · 32 tests | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C08 | `f5bf56ec` | OWASP25-C039/C049 + T17/T18/T21 | A02/A05 | `g06-topology-tls.spec.ts` + arnés | `cd apps/backend && npx vitest run test/g06-topology-tls.spec.ts`<br>`infra/staging/run-harness.sh` | PASS · 9 tests + arnés | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C09 | `b782af1a` | OWASP25-C039 | A05 | `chat-individual-navegacion.spec.ts`, `chat-mensajeria.spec.ts`, `csp-violaciones.spec.ts`, `kanban-drag.spec.ts`, `recuperar-contrasena.spec.ts`, `registro-postulacion.spec.ts`, `csp-violations.spec.ts` | `cd apps/frontend && npx vitest run test/csp-violations.spec.ts`<br>`cd apps/frontend && npx playwright test` (production-like local) | PASS · suite verde | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |
| G06-C10 | `c50eeac6` | NBD-1 operational | A02 | `g06-tls-expiry-probe.spec.ts` | `cd apps/backend && npx vitest run test/g06-tls-expiry-probe.spec.ts` | PASS · 14 tests | auditoria_gate_G06_http_headers_csp_https.md §24 | RB-CODE | PASS |

## G05 — Security Logging & Alerting

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G05-C01 | `46400403` | OWASP25-C026 | A09/A04 | `g05-audit-redaction.spec.ts` | `cd apps/backend && npx vitest run test/g05-audit-redaction.spec.ts` | PASS · 32 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C02 | `bda8512b` | OWASP25-C037 | A09 | `g05-security-event-catalog.spec.ts` | `cd apps/backend && npx vitest run test/g05-security-event-catalog.spec.ts` | PASS · 5 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C03 | `9b2a0b61` | OWASP25-C037 | A09 | `g05-security-event-writer.spec.ts` | `cd apps/backend && npx vitest run test/g05-security-event-writer.spec.ts` | PASS · 4 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C04 | `fa6de0bb` | OWASP25-C037 | A09 | `g05-auth-security-events.spec.ts` | `cd apps/backend && npx vitest run test/g05-auth-security-events.spec.ts` | PASS · 6 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C05 | `593b2481` | OWASP25-C037/C036 | A09/A07 | `g05-account-locked-event.spec.ts` | `cd apps/backend && npx vitest run test/g05-account-locked-event.spec.ts` | PASS · 4 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C06 | `f5f7641a` | OWASP25-C037 | A09 | `g05-password-reset-events.spec.ts`, `password-recovery-admin.real-db.e2e.spec.ts` | `cd apps/backend && npx vitest run test/g05-password-reset-events.spec.ts`<br>`cd apps/backend && npm run test:integration` (PostgreSQL desechable) | PASS · 10 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C07 | `d89c9ef2` | OWASP25-C037 | A09 | `g05-user-status-events.spec.ts` | `cd apps/backend && npx vitest run test/g05-user-status-events.spec.ts` | PASS · 5 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C08 | `da773d4b` | OWASP25-C037 | A01/A09 | `g05-security-event-visibility.integration.spec.ts` | `cd apps/backend && npm run test:integration` (PostgreSQL desechable) | PASS · 1 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C09 | `113324fc` | OWASP25-C037 + C021 | A09/A07 | `controllers-and-basic.spec.ts`, `g05-ip-trust.spec.ts` | `cd apps/backend && npx vitest run test/controllers-and-basic.spec.ts test/g05-ip-trust.spec.ts` | PASS · 8 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C10 | `c52f326d` | FASE2-N03 + C016/C037 | A09 | `g05-export-event-contract.spec.ts` | `cd apps/backend && npx vitest run test/g05-export-event-contract.spec.ts` | PASS · 5 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |
| G05-C11 | `108daaca` | OWASP25-C038 | A09 | `g05-security-alert-migration.spec.ts`, `g05-security-alert-type.integration.spec.ts` | `cd apps/backend && npx vitest run test/g05-security-alert-migration.spec.ts`<br>`cd apps/backend && npm run test:integration` (PostgreSQL desechable) | PASS · 5 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-FORWARD-FIX | PASS |
| G05-C12 | `1a876c8d` | OWASP25-C038 | A09 | `g05-security-alerts.spec.ts`, `g05-security-alerts.integration.spec.ts`, `s7-environment.spec.ts` | `cd apps/backend && npx vitest run test/g05-security-alerts.spec.ts test/s7-environment.spec.ts`<br>`cd apps/backend && npm run test:integration` (PostgreSQL desechable) | PASS · 20 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-FLAG + RB-FORWARD-FIX | PASS |
| G05-C13 | `88add5ae` | OWASP25-C038 | A09 | `security-alert-notification.spec.ts` | `cd apps/frontend && npx vitest run test/security-alert-notification.spec.ts` | PASS · 4 tests | auditoria_gate_G05_security_logging_alerting.md §26 | RB-CODE | PASS |

## G07 — Input / Output / WebSocket Security

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G07-C01 | `c4b189e6` | OWASP25-C025 + conserva C002/C005 | A01/A07 | `g07-ws-auth-policy.spec.ts` | `cd apps/backend && npx vitest run test/g07-ws-auth-policy.spec.ts` | PASS · 24 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C02 | `1995d3de` | OWASP25-C025 | A01/A07 | `g01-jwt-secret-readers.spec.ts`, `g07-notifications-gateway-auth.spec.ts`, `notifications.gateway.spec.ts`, `notifications.service.spec.ts` | `cd apps/backend && npx vitest run test/g01-jwt-secret-readers.spec.ts test/g07-notifications-gateway-auth.spec.ts test/notifications.gateway.spec.ts test/notifications.service.spec.ts` | PASS · 55 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C03 | `2c2f6c1d` | OWASP25-C025 + C005 | A01/A07 | `chat.gateway.spec.ts`, `g01-jwt-secret-readers.spec.ts`, `g07-chat-gateway-auth.spec.ts` | `cd apps/backend && npx vitest run test/chat.gateway.spec.ts test/g01-jwt-secret-readers.spec.ts test/g07-chat-gateway-auth.spec.ts` | PASS · 28 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C04 | `1f298531` | OWASP25-C025 | A07 | `g07-account-disconnect.spec.ts` | `cd apps/backend && npx vitest run test/g07-account-disconnect.spec.ts` | PASS · 11 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C05 | `4a22c754` | P2/T12 | A07/A10 | `realtime-same-origin.spec.ts` | `cd apps/frontend && npx vitest run test/realtime-same-origin.spec.ts` | PASS · 5 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C06 | `9db3206b` | P2/T12 | A07/A10 | `chat-same-origin.spec.ts` | `cd apps/frontend && npx vitest run test/chat-same-origin.spec.ts` | PASS · 3 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C07 | `b4ac8b3a` | P2/P4 | A10/A07 | `g07-public-api-url-variant.spec.ts` | `cd apps/backend && npx vitest run test/g07-public-api-url-variant.spec.ts` | PASS · 17 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C08 | `d31e7085` | OWASP25-C027 + C001 | A05/A04 | `g07-url-validation.spec.ts` | `cd apps/backend && npx vitest run test/g07-url-validation.spec.ts` | PASS · 185 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C09 | `d70a4572` | OWASP25-C027 | A05/A04 | `safe-links.spec.tsx` | `cd apps/frontend && npx vitest run test/safe-links.spec.tsx` | PASS · 26 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C10 | `17949faf` | OWASP25-C006/C007 | A05/A03 | `g07-raw-sql-guard.spec.ts`, `html-sink-guard.spec.ts` | `cd apps/backend && npx vitest run test/g07-raw-sql-guard.spec.ts`<br>`cd apps/frontend && npx vitest run test/html-sink-guard.spec.ts` | PASS · 13 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C11 | `206979ec` | VM1-N06 / OWASP A04/A05:2025 | A04/A05 | `g07-csv-formula-neutralization.spec.ts` | `cd apps/backend && npx vitest run test/g07-csv-formula-neutralization.spec.ts` | PASS · 12 tests | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |
| G07-C12 | `7a9ebc4e` | T14 + P2/C025 | A01/A07/A10 | `g07-topology-t14.spec.ts`, `realtime-same-origin.spec.ts` + arnés | `cd apps/backend && npx vitest run test/g07-topology-t14.spec.ts`<br>`cd apps/frontend && npx playwright test` (production-like local)<br>`infra/staging/run-harness.sh` | PASS · 14 tests + arnés | auditoria_gate_G07_input_output_websocket.md §27 | RB-CODE | PASS |

## G08 — Evidence / Traceability / Final Code Validation

| ID | SHA | Control | OWASP | Tests / evidencia | Comando local | Resultado | Auditoría | Rollback | Estado |
|---|---|---|---|---|---|---|---|---|---|
| G08-C01 | `506cd262` | OWASP25-C048 + T-273 (A01–A10) | A01/A10 | `g08-security-docs.spec.ts` | `cd apps/backend && npx vitest run test/g08-security-docs.spec.ts` | PASS · 18 tests | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C02 | `fa14a36c` | OWASP25-C048 | A08 | `g08-delta-allowlist.spec.ts` | `cd apps/backend && npx vitest run test/g08-delta-allowlist.spec.ts` | PASS · 7 tests | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C03 | `3358ec48` | OWASP25-C048 | A08 | `g08-owasp-delta-verifier.spec.ts` | `cd apps/backend && npx vitest run test/g08-owasp-delta-verifier.spec.ts` | PASS · 25 tests | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C04 | `0bfddb57` | OWASP25-C048 | A08 | `g08-ci-delta.spec.ts` | `cd apps/backend && npx vitest run test/g08-ci-delta.spec.ts` | PASS · 12 tests | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C05 | `2c31875a` | OWASP25-C048 (A01–A10) | A01/A10 | `g08-evidence-index.spec.ts` | `cd apps/backend && npx vitest run test/g08-evidence-index.spec.ts` | PASS · suite verde | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C06 | `7bebb355` | OWASP25-C048 + pruebas negativas (A01–A10) | A01/A10 | `g08-negative-controls.spec.ts` | `cd apps/backend && npx vitest run test/g08-negative-controls.spec.ts` | PASS · suite verde | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C07 | `35cb9cd8` | OWASP25-C048 (A01–A10) | A01/A10 | `g08-evidence-index.spec.ts` | `cd apps/backend && npx vitest run test/g08-evidence-index.spec.ts` | PASS · suite verde | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C08 | `785ad988` | OWASP25-C048 (A01–A10) | A01/A10 | `g08-admin-handoff.spec.ts` | `cd apps/backend && npx vitest run test/g08-admin-handoff.spec.ts` | PASS · suite verde | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C09 | `93918a08` | OWASP25-C048 (A01–A10) | A01/A10 | `g08-final-matrix.spec.ts` | `cd apps/backend && npx vitest run test/g08-final-matrix.spec.ts` | PASS · suite verde | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | PASS |
| G08-C10 | este commit | OWASP25-C048 | A01–A10 | `g08-final-evidence.spec.ts` | `cd apps/backend && npx vitest run test/g08-final-evidence.spec.ts` | PASS | auditoria_gate_G08_final_code_validation.md (al cierre) | RB-CODE | IMPLEMENTED |

## Baseline de código G01/G02 (G08-C07)

| Gate | Estado de código | Commits en el historial | Detalle |
|---|---|---|---|
| G01 | PASS | 12 | G01-C01…C12: las 12 propiedades implementadas y auditadas (`auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md`) |
| G02 | PASS_SCOPE_V2 | 17 | G02-C01, C02 y C04–C18 ejecutadas; **G02-C03 NO fue ejecutada por Vernel** y pasa al Gate Admin (plan maestro v2 §5). La auditoría intermedia de G02 registró `PENDING_C03_BY_LEADER_DECISION` antes de esa revisión |

## HU-159 (E2E) — PREEXISTING_HU159_E2E_FAILURE

- **Tests afectados:** `chat-individual-navegacion.spec.ts`, los casos «concurrencia» y «navegación» (HU-159, chat individual; owner: Angel).
- **Firma estable:** `element(s) not found`, `toBeVisible` y timeout de `fill`, sin cambios desde G02.
- **Antes de G02-C16:**
  - la auditoría de G02 (§10–§11) documenta los mismos 2 fallos, con la misma firma, en tres corridas;
  - también fallan con el servidor de desarrollo sobre una base recién sembrada;
  - pasan con conversaciones ya existentes, así que el defecto está en crear un chat individual sobre una base limpia.
- **Hasta la baseline de G08:** la baseline y la regresión final de cada gate (G03–G07) y la baseline de G08 reproducen exactamente los mismos 2 fallos: 5 PASS / 2 FAIL.
- **Chat en navegador:** `chat-mensajeria.spec.ts` pasa y los sockets aceptados en el E2E no cambian (28/0).
- **Clasificación:** riesgo preexistente de integración, no regresión de ningún gate. Ningún gate lo corrigió ni lo ocultó: no hubo `skip`, reintentos extra, timeouts más largos ni cambios en el seed.

## OUT_OF_SCOPE_ADMIN_HANDOFF (G08-C08)

Las operaciones que exigen GitHub Admin, `main`, la VM, un deploy o producción no tienen fila de código en este índice; son responsabilidad del administrador o líder después del PR único hacia `develop`.
- **Lista completa:** `owasp-top10-2025.md` → «Operaciones externas».
- **Referencia:** `09_GATE_ADMIN_HANDOFF_OWASP_2025.md`, que no estaba disponible localmente en G08, por lo que no se citan IDs de acción.
- **Estado:** siempre `OUT_OF_SCOPE_ADMIN_HANDOFF`; ninguna figura como ejecutada.
- **Única fila con ID de commit:** G02-C03, no ejecutada, en la tabla de G02.

| Gate | Operaciones externas | Estado |
|---|---|---|
| G01 | Rotación/revocación de secretos, verificación post-release del `.env` y de la imagen, longitud del secreto productivo | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G02 | G02-C03 (environment `production`), rulesets/checks requeridos, sincronización con `develop`, revisión de `k6.yml` | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G03 | Dependency Graph, Dependabot, secret scanning/push protection, NT04 | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G04 | P1 en el nginx vivo, cierre de puertos, binds loopback, `TRUST_PROXY_HOPS=1`, sondas T13/T16/T19 | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G06 | `CSP_MODE=enforce`, `COOKIE_SECURE=true`, TLS/HSTS/cabeceras en producción, sonda de certificado programada | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G05 | `SECURITY_ALERTS_ENABLED=true`, migración en producción, observabilidad operacional | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G07 | `PUBLIC_API_URL=same-origin` (P4), sondas T13/T14, recuento de URL heredadas | OUT_OF_SCOPE_ADMIN_HANDOFF |
| G08 | Merge del PR, check requerido `OWASP_DELTA_ISOLATED`, deploy, VM, `main` | OUT_OF_SCOPE_ADMIN_HANDOFF |
