# OWASP Top 10:2025 — Matriz del alcance de código

Workstream OWASP de la Fase 2 (Vernel), rama `sprint8/vernel-owasp2025`. Control transversal: **OWASP25-C048** (tests de regresión de seguridad) · tarea **T-273**.

Esta matriz cubre **solo el código versionado** de la rama:
- aplicación backend y frontend;
- workflows y configuración como código;
- nginx versionado;
- arnés efímero;
- tests.

Todo lo que exige GitHub Admin, `main`, la VM, un deploy o producción figura como `OUT_OF_SCOPE_ADMIN_HANDOFF` y lo ejecuta el administrador o líder después del PR único hacia `develop` (Gate Admin: `09_GATE_ADMIN_HANDOFF_OWASP_2025.md`). Una operación externa nunca figura aquí como ejecutada.

No contiene secretos, valores de cookies, tokens, direcciones IP, datos personales ni pasos de explotación.

## Estados

| Estado | Significado |
|---|---|
| `IMPLEMENTED` | Código y tests commiteados en el gate indicado; evidencia pendiente de indexar |
| `PASS` | Implementado y con evidencia indexada en `evidence-index.md` (test, commit, auditoría) |
| `SKIPPED_BY_PREFLIGHT` | Commit condicional que el preflight descartó con evidencia |
| `RESIDUAL_CODE_RISK` | Riesgo de código conocido y aceptado, con owner y justificación |
| `OUT_OF_SCOPE_ADMIN_HANDOFF` | Requiere GitHub Admin, `main`, VM, deploy o producción; no es trabajo de Vernel |
| `NOT_APPLICABLE` | El control no aplica a esta arquitectura (justificado) |

## Resumen A01–A10

| Categoría | Controles de código | Estado | Gates |
|---|---|---|---|
| A01 Broken Access Control | C025 (handshake WS), C005 (membresía de chat), C037 visibilidad de eventos, C004/C015 conservados | IMPLEMENTED | G05, G07 |
| A02 Security Misconfiguration | C020, C039 (cabeceras/CSP), C008 (HSTS), C047 (nginx versionado), C049 (`COOKIE_SECURE`), FASE2-N08 | IMPLEMENTED | G01, G02, G06 |
| A03 Software Supply Chain Failures | C028, C040, C041, C042, C059, C046 (registro de excepciones) | IMPLEMENTED | G03 |
| A04 Cryptographic Failures | C019 (fail-closed del secreto), C026 (redacción), C027 (URL), C029/C030 | IMPLEMENTED | G01, G05, G07 |
| A05 Injection | C027, C001, C006 (SQL crudo fijado), C007 (sumideros HTML fijados), C039 (CSP), VM1-N06 (CSV) | IMPLEMENTED | G06, G07 |
| A06 Insecure Design | C036 (bloqueo por cuenta), C014, controles de recuperación de G04 | IMPLEMENTED | G04 |
| A07 Authentication Failures | C019, C022, C023, C024, C025, C036, C021 | IMPLEMENTED | G01, G04, G07 |
| A08 Software or Data Integrity Failures | C031–C035, C043, C044, C047, C029, FASE2-N07, VM0-F020 | IMPLEMENTED | G01, G02 |
| A09 Security Logging & Alerting Failures | C026, C037, C038, C016 | IMPLEMENTED | G05 |
| A10 Mishandling of Exceptional Conditions | C021 (confianza de proxy), P1/P2 (tiempo real por nginx), C040/C041 (errores de dependencias visibles) | IMPLEMENTED | G03, G04, G07 |

## Controles de la Fase 2

| Control | Qué cubre | OWASP | Gate | Commits | Evidencia (tests) | Estado | Handoff externo |
|---|---|---|---|---|---|---|---|
| C019 | `JWT_SECRET` fail-closed: proveedor único, validación de arranque, compose, CI sintético | A07/A02/A04 | G01 | G01-C01…C05, G01-C12 | `jwt-secret-config.spec.ts`, `g01-jwt-secret-readers.spec.ts`, `g01-compose-contract.spec.ts`, `g01-synthetic-jwt-environment.spec.ts` | IMPLEMENTED | Longitud del secreto productivo (Gate Admin) |
| C020 | Secretos de servidor fuera de la imagen del frontend | A02/A08 | G01 | G01-C06 | `g01-frontend-image-secrets.spec.ts` | IMPLEMENTED | Rotación/revocación de claves (Gate Admin) |
| C029 | Seed fuera del arranque productivo | A04/A08 | G01 | G01-C09 | `g01-backend-startup.spec.ts` | IMPLEMENTED | — |
| C030 | Contrato de configuración del deploy y retiro del stub público | A02/A04/A08 | G01 | G01-C07, C08, C10, C12 | `g01-deploy-env-transport.spec.ts`, `g01-deploy-config-contract.spec.ts`, `controllers-and-basic.spec.ts`, `g01-env-example-contract.spec.ts` | IMPLEMENTED | — |
| FASE2-N08 | Backups y claves privadas ignorados por Git | A02/A08 | G01 | G01-C11 | `g01-gitignore-contract.spec.ts` | IMPLEMENTED | — |
| C044/C045 | Deploy solo desde `main`, permisos mínimos, concurrencia | A08 | G02 | G02-C01, G02-C02 | `security-deploy-ref-guard.spec.ts`, `g02-workflow-permissions.spec.ts` | IMPLEMENTED | Rulesets/branch protection y environment `production` (G02-C03) |
| C035 | Publicación de imágenes solo con tests verdes | A08 | G02 | G02-C04 | `g02-publish-gate.spec.ts` | IMPLEMENTED | — |
| VM0-F020 | Deploy abortado con checkout productivo sucio | A08 | G02 | G02-C05 | `g02-deploy-dirty-checkout.spec.ts` | IMPLEMENTED | — |
| FASE2-N07 | Modo `config-only` y variantes inmutables del frontend | A08 | G02 | G02-C06, G02-C07 | `g02-deploy-config-only.spec.ts`, `g02-immutable-variants.spec.ts` | IMPLEMENTED | — |
| C031/C043/C032 | Lint bloqueante, typecheck, build y tests del frontend en todo evento | A08 | G02 | G02-C08…C12 | `g02-ci-quality-gates.spec.ts` | IMPLEMENTED | Checks requeridos (Gate Admin) |
| C033 | E2E production-like antes del deploy | A08 | G02 | G02-C13, G02-C14 | `g02-e2e-trigger-contract.spec.ts`, `g02-e2e-production-like.spec.ts` | IMPLEMENTED | — |
| C034 | Integración con PostgreSQL real en CI | A08 | G02 | G02-C15 | `g02-real-db-integration.spec.ts` | IMPLEMENTED | — |
| C047 | nginx versionado y arnés efímero de topología | A02/A08 | G02, G04 | G02-C16…C18, G04-C11 | `g02-nginx-baseline.spec.ts`, `g02-topology-harness.spec.ts`, `g02-topology-ci.spec.ts` | IMPLEMENTED | Aplicar la ruta P1 en el nginx vivo |
| C041 | `dependency-review` bloquea dependencias nuevas high/critical | A03 | G03 | G03-C01 | `g03-dependency-review.spec.ts` | IMPLEMENTED | Dependency Graph (Gate Admin) |
| C040 | Resumen informativo de `npm audit` | A03 | G03 | G03-C02, G03-C11 | `g03-npm-audit-summary.spec.ts` | IMPLEMENTED | — |
| C042 | Dependabot controlado | A03 | G03 | G03-C03 | `g03-dependabot.spec.ts` | IMPLEMENTED | Activar Dependabot (Gate Admin) |
| C028 | Retiro de dependencias sin uso y remediación segura | A03 | G03 | G03-C04…C09 | lockfiles + `npm ci` reproducible (auditoría G03 §9–§12) | IMPLEMENTED | — |
| C059 | Remediación de jsPDF alcanzable en el backend | A03 | G03 | G03-C10 | `g03-jspdf-remediation.spec.ts`, `pdf-export.builder.spec.ts` | IMPLEMENTED | — |
| C046 | Registro de excepciones de dependencias con owner y caducidad | A03 | G03 | G03-C11 | `g03-dependency-exceptions.spec.ts` | IMPLEMENTED | Secret scanning / push protection (Gate Admin) |
| C022 | Throttle del registro | A07 | G04 | G04-C01 | `g04-register-throttle.spec.ts` | IMPLEMENTED | — |
| C023 | Trabajo bcrypt equivalente y tokens solo para cuentas ACTIVO | A07 | G04 | G04-C02, G04-C03 | `g04-login-equal-work.spec.ts`, `g04-active-only-tokens.spec.ts` | IMPLEMENTED | — |
| C024 | Reset atómico con revocación de sesiones | A07 | G04 | G04-C04 | `g04-reset-atomic.spec.ts`, `password-recovery-admin.real-db.e2e.spec.ts` | IMPLEMENTED | — |
| C036 | Bloqueo temporal por cuenta y cota de recuperación | A07/A06 | G04 | G04-C05…C07 | `g04-account-attempts.spec.ts`, `g04-account-lockout.spec.ts`, `g04-recovery-bound.spec.ts` | IMPLEMENTED | — |
| C021 | Salto de proxy confiable explícito, rate limiting conductual, binds parametrizados, anti-spoofing | A07/A10 | G04 | G04-C08…C10, G04-C13, G04-C14 | `g04-trust-proxy.spec.ts`, `security-rate-limiting.spec.ts`, `security-exposed-ports.spec.ts`, `g04-xff-spoof.spec.ts`, `api-proxy-xff.spec.ts` | IMPLEMENTED | Activar `TRUST_PROXY_HOPS`/binds loopback tras cerrar puertos |
| P1/T13 | Socket.IO a través de nginx (polling + upgrade) | A10/A07 | G04 | G04-C11, G04-C12 | `g04-topology-t13.spec.ts` + arnés | IMPLEMENTED | Aplicar P1 en el nginx vivo |
| C039 | Cabeceras del frontend y CSP report-only/enforce | A02/A05 | G06 | G06-C01…C05, G06-C08, G06-C09 | `security-headers-contract.spec.ts`, `csp-policy.spec.ts`, `csp-mode.spec.ts`, `g06-csp-mode-deploy.spec.ts`, `csp-violations.spec.ts` | IMPLEMENTED | `CSP_MODE=enforce` remoto |
| C008 | HSTS explícito en la API | A02 | G06 | G06-C06 | `g06-hsts.spec.ts` | IMPLEMENTED | — |
| C049 (parcial) | `COOKIE_SECURE` cableado en el deploy; TLS local T17/T18/T21 | A02/A07 | G06 | G06-C07, G06-C08 | `g06-cookie-secure.spec.ts`, `g06-topology-tls.spec.ts` | IMPLEMENTED | `COOKIE_SECURE=true` remoto con todo el tráfico HTTPS |
| NBD-1 | Sonda de caducidad del certificado | A02 | G06 | G06-C10 | `g06-tls-expiry-probe.spec.ts` | IMPLEMENTED | Programar la sonda contra producción |
| C026 | Redacción recursiva del log técnico | A09/A04 | G05 | G05-C01 | `g05-audit-redaction.spec.ts` | IMPLEMENTED | — |
| C037 | Eventos de seguridad (login, bloqueo, reset, estado de cuenta, IP confiable) sin PII ni secretos; visibilidad protegida; contrato de exportación | A09/A01 | G05 | G05-C02…C10 | `g05-security-event-catalog.spec.ts`, `g05-security-event-writer.spec.ts`, `g05-auth-security-events.spec.ts`, `g05-account-locked-event.spec.ts`, `g05-password-reset-events.spec.ts`, `g05-user-status-events.spec.ts`, `g05-ip-trust.spec.ts`, `g05-export-event-contract.spec.ts`, integración `g05-security-event-visibility` | IMPLEMENTED | — |
| C038 | Alerta de ráfaga a admins detrás de `SECURITY_ALERTS_ENABLED` | A09 | G05 | G05-C11…C13 | `g05-security-alert-migration.spec.ts`, `g05-security-alerts.spec.ts`, integración `g05-security-alerts`, `security-alert-notification.spec.ts` | IMPLEMENTED | `SECURITY_ALERTS_ENABLED=true` y migración en producción |
| C025 | Política única de handshake WebSocket (access + ACTIVO) y desconexión al bloquear | A01/A07 | G07 | G07-C01…C04, G07-C12 | `g07-ws-auth-policy.spec.ts`, `g07-notifications-gateway-auth.spec.ts`, `g07-chat-gateway-auth.spec.ts`, `g07-account-disconnect.spec.ts`, T14 | IMPLEMENTED | — |
| P2 | Tiempo real same-origin y variante `PUBLIC_API_URL` | A10/A07 | G07 | G07-C05…C07 | `realtime-same-origin.spec.ts`, `chat-same-origin.spec.ts`, `g07-public-api-url-variant.spec.ts` | IMPLEMENTED | `PUBLIC_API_URL=same-origin` remoto (P4) |
| C027 | Solo http(s) en los 5 campos URL; enlaces seguros | A05/A04 | G07 | G07-C08, G07-C09 | `g07-url-validation.spec.ts`, `safe-links.spec.tsx` | IMPLEMENTED | Recuento de URL heredadas inválidas en producción |
| C006/C007 | Superficie de SQL crudo y de sumideros HTML fijada | A05/A03 | G07 | G07-C10 | `g07-raw-sql-guard.spec.ts`, `html-sink-guard.spec.ts` | IMPLEMENTED | — |
| VM1-N06 | Neutralización de fórmulas en CSV | A05/A04 | G07 | G07-C11 | `g07-csv-formula-neutralization.spec.ts` | IMPLEMENTED | — |
| T14 | Tiempo real same-origin completo en el arnés (nginx + TLS) | A01/A07/A10 | G07 | G07-C12 | `g07-topology-t14.spec.ts`, `infra/staging/realtime.mjs` | IMPLEMENTED | Sondas T13/T14 en producción |
| C048 | Tests de regresión de seguridad consolidados y trazables | Transversal | G08 | G08-C01…C10 | Este documento, `evidence-index.md`, verificador del delta | IMPLEMENTED | — |

## Controles conservados (no-regresión)

C001 (ValidationPipe), C002 (tipo de token y estado en HTTP), C003 (refresh rotado), C004 (autorización por proyecto), C005 (membresía de chat), C006 (SQL parametrizado), C007 (escape de React), C008 (Helmet), C009 (Docker no-root), C010 (BD en loopback), C011 (`npm ci`), C012 (bcrypt), C013 (almacenamiento de cierre), C014 (respuesta genérica en forgot), C015 (`returnTo` acotado), C016 (bitácora con `tx`), C017 (sesión solo en cookie) y C018 (throttler) se conservan. Sus suites existentes siguen verdes en la regresión de cada gate.

## Pospuestos y no aplicables

| Control | Estado | Motivo |
|---|---|---|
| C050 Autenticación de Redis | RESIDUAL_CODE_RISK | Pospuesto a T-212 (Angel); Redis no está publicado |
| C051 CodeQL · C052 Trivy · C053 SBOM · C054 Actions por SHA | RESIDUAL_CODE_RISK | Fuera de la Fase 2 (Sprint 9); Dependabot `github-actions` mantiene los tags |
| C055 Revocación en cascada · C056 tiempos en forgot · C057 filtro global de excepciones · C058 secreto propio de reset | RESIDUAL_CODE_RISK | Fuera de la Fase 2 (Sprint 9); C025 mitiga C058 (el claim `tipo` se exige en HTTP y WS) |
| C060 cobertura en `workflow_call` · C061 `HEALTHCHECK` · C062 rutas Next legadas · C063 MFA | RESIDUAL_CODE_RISK | Fuera de la Fase 2 |
| C064–C070 | NOT_APPLICABLE | Sanitizer HTML en backend, tokens CSRF, SRI, rate limit en nginx, deserialización, gitleaks, `X-XSS-Protection`: no aplican a esta arquitectura (plan maestro §21) |
