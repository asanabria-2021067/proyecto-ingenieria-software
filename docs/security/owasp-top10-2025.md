# OWASP Top 10:2025 — Matriz del alcance de código

Workstream OWASP de la Fase 2 (Vernel), rama `sprint8/vernel-owasp2025`. Control transversal: **OWASP25-C048** (tests de regresión de seguridad) · tarea **T-273**.

Esta matriz cubre **solo el código versionado** de la rama:
- aplicación backend y frontend;
- workflows y configuración como código;
- nginx versionado;
- arnés efímero;
- tests.

Todo lo que exige GitHub Admin, `main`, la VM, un deploy o producción figura como `OUT_OF_SCOPE_ADMIN_HANDOFF` y lo ejecuta el administrador o líder después del PR único hacia `develop` (Gate Admin: `09_GATE_ADMIN_HANDOFF_OWASP_2025.md`). En la tabla de operaciones externas todas conservan el estado `OUT_OF_SCOPE_ADMIN_HANDOFF`, y su estado real va al inicio de la referencia: `EXTERNAL_EXECUTED` cuando hay fecha y evidencia versionada en el repo (documento, reporte o commit) o un registro de GitHub Actions enlazado (como el run de deploy), `PENDING_CONFIRMATION` si se reportó pero falta esa evidencia, o `EXTERNAL_NOT_APPLIED` si se verificó que no está aplicada. La evidencia de la verificación del 2026-10-11 no está versionada en el repo y se indica así en cada fila. Las operaciones ejecutadas provienen de HU-180 (Sprint 9, T-308/T-309/T-311): `docs/sprint9/feature-IESUC-490-hu-180-cierre-seguridad-produccion.md`.

No contiene secretos, valores de cookies, tokens, direcciones IP, datos personales ni pasos de explotación.

Documentos relacionados:
- evidencia por commit: `evidence-index.md`;
- pruebas negativas: `negative-controls.md`;
- cierre y paquete del PR único: `owasp-final-evidence.md`.

## Estados

| Estado | Significado |
|---|---|
| `IMPLEMENTED` | Código y tests commiteados en el gate indicado; evidencia pendiente de indexar |
| `PASS` | Implementado y con evidencia indexada en `evidence-index.md` (test, commit, auditoría). Pasada final: G08-C09 |
| `SKIPPED_BY_PREFLIGHT` | Commit condicional que el preflight descartó con evidencia |
| `RESIDUAL_CODE_RISK` | Riesgo de código conocido y aceptado, con owner y justificación |
| `OUT_OF_SCOPE_ADMIN_HANDOFF` | Requiere GitHub Admin, `main`, VM, deploy o producción; no es trabajo de Vernel |
| `NOT_APPLICABLE` | El control no aplica a esta arquitectura (justificado) |
| `EXTERNAL_EXECUTED` | Operación externa ejecutada por el administrador o líder, con fecha y evidencia versionada (documento, reporte o commit) o un registro de GitHub Actions enlazado (como el run de deploy) |
| `PENDING_CONFIRMATION` | Operación externa reportada como hecha o parcial, sin evidencia versionada suficiente para darla por ejecutada |
| `EXTERNAL_NOT_APPLIED` | Operación externa verificada como no aplicada en GitHub o en la VM; sigue pendiente de ejecutar |

## Resumen A01–A10

| Categoría | Controles de código | Estado | Gates |
|---|---|---|---|
| A01 Broken Access Control | C025 (handshake WS), C005 (membresía de chat), C037 visibilidad de eventos, C004/C015 conservados | PASS | G05, G07 |
| A02 Security Misconfiguration | C020, C039 (cabeceras/CSP), C008 (HSTS), C047 (nginx versionado), C049 (`COOKIE_SECURE`), FASE2-N08 | PASS | G01, G02, G06 |
| A03 Software Supply Chain Failures | C028, C040, C041, C042, C059, C046 (registro de excepciones) | PASS | G03 |
| A04 Cryptographic Failures | C019 (fail-closed del secreto), C026 (redacción), C027 (URL), C029/C030 | PASS | G01, G05, G07 |
| A05 Injection | C027, C001, C006 (SQL crudo fijado), C007 (sumideros HTML fijados), C039 (CSP), VM1-N06 (CSV) | PASS | G06, G07 |
| A06 Insecure Design | C036 (bloqueo por cuenta), C014, controles de recuperación de G04 | PASS | G04 |
| A07 Authentication Failures | C019, C022, C023, C024, C025, C036, C021 | PASS | G01, G04, G07 |
| A08 Software or Data Integrity Failures | C031–C035, C043, C044, C047, C029, FASE2-N07, VM0-F020 | PASS | G01, G02 |
| A09 Security Logging & Alerting Failures | C026, C037, C038, C016 | PASS | G05 |
| A10 Mishandling of Exceptional Conditions | C021 (confianza de proxy), P1/P2 (tiempo real por nginx), C040/C041 (errores de dependencias visibles) | PASS | G03, G04, G07 |

## Estado final tras HU-180 (Sprint 9)

El estado de código de las diez categorías no cambia: todas siguen en `PASS`. Lo que cambia es el estado de sus operaciones externas, aplicadas desde el 2026-10-04 en HU-180 (PR #259), con el despliegue de CSP el 2026-10-06, y de la verificación de GitHub y de la VM del 2026-10-11 (no versionada en el repo). Las categorías que no aparecen aquí (A01, A03, A04 y A06) no tienen operaciones de HU-180.

| Categoría | Estado del código | Operaciones externas | Evidencia |
|---|---|---|---|
| A02 Security Misconfiguration | PASS | Puertos de la app cerrados con binds loopback: `EXTERNAL_EXECUTED`. `CSP_MODE=enforce`: `EXTERNAL_EXECUTED` el 2026-10-06 (deploy run #87 desde `main`, commit 1dd4faf); re-escaneo ZAP pendiente. Escaneo ZAP baseline: `EXTERNAL_EXECUTED`, sin hallazgos altos ni medios. Revisión de nginx del 2026-10-11: TLS 1.0 y 1.1 habilitados y un respaldo del sitio cargado desde `sites-enabled` (`EXTERNAL_NOT_APPLIED`, falta corregirlos) | HU-180 T-309 §1 y §4 (commits 99b19c31, d1fcc8e2); `zap/README.md` y `zap/zap-baseline-produccion.invalido.local-20261004.html` (commits 67704806, 1e349893); revisión de nginx en la VM del 2026-10-11 (validación de la configuración, estado del servicio y volcado completo de la configuración; no versionada en el repo) |
| A05 Injection | PASS | Escaneo ZAP baseline: `EXTERNAL_EXECUTED`, `FAIL-NEW: 0`. Es pasivo: no ejecuta ataques de inyección | `zap/README.md` |
| A07 Authentication Failures | PASS | Binds loopback y `TRUST_PROXY_HOPS=1`: `EXTERNAL_EXECUTED` | HU-180 T-309 §1–§2 (commits 99b19c31, 991f9db1) |
| A08 Software or Data Integrity Failures | PASS | Protección de ramas `develop` y `main`: `EXTERNAL_NOT_APPLIED` al 2026-10-11 (ambos rulesets deshabilitados y el de `main` sin rama objetivo); falta habilitarla | HU-180 T-308 (commits 72ad66b9, 13443939); verificación del equipo del 2026-10-11, no versionada en el repo |
| A09 Security Logging & Alerting Failures | PASS | `SECURITY_ALERTS_ENABLED=true` con la migración `ALERTA_SEGURIDAD` ya aplicada: `EXTERNAL_EXECUTED` | HU-180 T-309 §3 (commit 551a99be) |
| A10 Mishandling of Exceptional Conditions | PASS | `TRUST_PROXY_HOPS=1`: `EXTERNAL_EXECUTED`. Ruta P1 en el nginx vivo: `PENDING_CONFIRMATION` (al 2026-10-11 el proxy usa los binds en loopback, pero no aparece la configuración de Socket.IO) | HU-180 T-309 §1–§2 (commits 99b19c31, 991f9db1); revisión de nginx en la VM del 2026-10-11 (validación de la configuración, estado del servicio y volcado completo de la configuración; no versionada en el repo) |

## Baseline de código G01/G02

| Gate | Estado | Commits | Nota |
|---|---|---|---|
| G01 Secrets & Configuration Fail-Closed | PASS | 12 (G01-C01…C12) | Código completo y auditado |
| G02 CI/CD Integrity | PASS_SCOPE_V2 | 17 (G02-C01, C02, C04–C18) | **G02-C03 no fue ejecutada por Vernel**: exige el environment `production` de GitHub y queda como `OUT_OF_SCOPE_ADMIN_HANDOFF` |

**HU-159 (E2E del chat individual):** `PREEXISTING_HU159_E2E_FAILURE`. Existía antes de G02-C16, con la misma firma, y se mantiene idéntica hasta G08. No es una regresión de ningún gate. El detalle está en `evidence-index.md`.

## Controles de la Fase 2

| Control | Qué cubre | OWASP | Gate | Commits | Evidencia (tests) | Estado | Handoff externo |
|---|---|---|---|---|---|---|---|
| C019 | `JWT_SECRET` fail-closed: proveedor único, validación de arranque, compose, CI sintético | A07/A02/A04 | G01 | G01-C01…C05, G01-C12 | `jwt-secret-config.spec.ts`, `g01-jwt-secret-readers.spec.ts`, `g01-compose-contract.spec.ts`, `g01-synthetic-jwt-environment.spec.ts` | PASS | Longitud del secreto productivo (Gate Admin) |
| C020 | Secretos de servidor fuera de la imagen del frontend | A02/A08 | G01 | G01-C06 | `g01-frontend-image-secrets.spec.ts` | PASS | Rotación/revocación de claves (Gate Admin) |
| C029 | Seed fuera del arranque productivo | A04/A08 | G01 | G01-C09 | `g01-backend-startup.spec.ts` | PASS | — |
| C030 | Contrato de configuración del deploy y retiro del stub público | A02/A04/A08 | G01 | G01-C07, C08, C10, C12 | `g01-deploy-env-transport.spec.ts`, `g01-deploy-config-contract.spec.ts`, `controllers-and-basic.spec.ts`, `g01-env-example-contract.spec.ts` | PASS | — |
| FASE2-N08 | Backups y claves privadas ignorados por Git | A02/A08 | G01 | G01-C11 | `g01-gitignore-contract.spec.ts` | PASS | — |
| C044/C045 | Deploy solo desde `main`, permisos mínimos, concurrencia | A08 | G02 | G02-C01, G02-C02 | `security-deploy-ref-guard.spec.ts`, `g02-workflow-permissions.spec.ts` | PASS | Rulesets/branch protection y environment `production` (G02-C03) (ver Operaciones externas y Estado final tras HU-180) |
| C035 | Publicación de imágenes solo con tests verdes | A08 | G02 | G02-C04 | `g02-publish-gate.spec.ts` | PASS | — |
| VM0-F020 | Deploy abortado con checkout productivo sucio | A08 | G02 | G02-C05 | `g02-deploy-dirty-checkout.spec.ts` | PASS | — |
| FASE2-N07 | Modo `config-only` y variantes inmutables del frontend | A08 | G02 | G02-C06, G02-C07 | `g02-deploy-config-only.spec.ts`, `g02-immutable-variants.spec.ts` | PASS | — |
| C031/C043/C032 | Lint bloqueante, typecheck, build y tests del frontend en todo evento | A08 | G02 | G02-C08…C12 | `g02-ci-quality-gates.spec.ts` | PASS | Checks requeridos (Gate Admin) |
| C033 | E2E production-like antes del deploy | A08 | G02 | G02-C13, G02-C14 | `g02-e2e-trigger-contract.spec.ts`, `g02-e2e-production-like.spec.ts` | PASS | — |
| C034 | Integración con PostgreSQL real en CI | A08 | G02 | G02-C15 | `g02-real-db-integration.spec.ts` | PASS | — |
| C047 | nginx versionado y arnés efímero de topología | A02/A08 | G02, G04 | G02-C16…C18, G04-C11 | `g02-nginx-baseline.spec.ts`, `g02-topology-harness.spec.ts`, `g02-topology-ci.spec.ts` | PASS | Aplicar la ruta P1 en el nginx vivo (ver Operaciones externas y Estado final tras HU-180) |
| C041 | `dependency-review` bloquea dependencias nuevas high/critical | A03 | G03 | G03-C01 | `g03-dependency-review.spec.ts` | PASS | Dependency Graph (Gate Admin) |
| C040 | Resumen informativo de `npm audit` | A03 | G03 | G03-C02, G03-C11 | `g03-npm-audit-summary.spec.ts` | PASS | — |
| C042 | Dependabot controlado | A03 | G03 | G03-C03 | eliminado en commit b9c3b183 (develop) | PASS | — |
| C028 | Retiro de dependencias sin uso y remediación segura | A03 | G03 | G03-C04…C09 | lockfiles + `npm ci` reproducible (auditoría G03 §9–§12) | PASS | — |
| C059 | Remediación de jsPDF alcanzable en el backend | A03 | G03 | G03-C10 | `g03-jspdf-remediation.spec.ts`, `pdf-export.builder.spec.ts` | PASS | — |
| C046 | Registro de excepciones de dependencias con owner y caducidad | A03 | G03 | G03-C11 | `g03-dependency-exceptions.spec.ts` | PASS | Secret scanning / push protection (Gate Admin) |
| C022 | Throttle del registro | A07 | G04 | G04-C01 | `g04-register-throttle.spec.ts` | PASS | — |
| C023 | Trabajo bcrypt equivalente y tokens solo para cuentas ACTIVO | A07 | G04 | G04-C02, G04-C03 | `g04-login-equal-work.spec.ts`, `g04-active-only-tokens.spec.ts` | PASS | — |
| C024 | Reset atómico con revocación de sesiones | A07 | G04 | G04-C04 | `g04-reset-atomic.spec.ts`, `password-recovery-admin.real-db.e2e.spec.ts` | PASS | — |
| C036 | Bloqueo temporal por cuenta y cota de recuperación | A07/A06 | G04 | G04-C05…C07 | `g04-account-attempts.spec.ts`, `g04-account-lockout.spec.ts`, `g04-recovery-bound.spec.ts` | PASS | — |
| C021 | Salto de proxy confiable explícito, rate limiting conductual, binds parametrizados, anti-spoofing | A07/A10 | G04 | G04-C08…C10, G04-C13, G04-C14 | `g04-trust-proxy.spec.ts`, `security-rate-limiting.spec.ts`, `security-exposed-ports.spec.ts`, `g04-xff-spoof.spec.ts`, `api-proxy-xff.spec.ts` | PASS | Activar `TRUST_PROXY_HOPS`/binds loopback tras cerrar puertos (ver Operaciones externas y Estado final tras HU-180) |
| P1/T13 | Socket.IO a través de nginx (polling + upgrade) | A10/A07 | G04 | G04-C11, G04-C12 | `g04-topology-t13.spec.ts` + arnés | PASS | Aplicar P1 en el nginx vivo (ver Operaciones externas y Estado final tras HU-180) |
| C039 | Cabeceras del frontend y CSP report-only/enforce | A02/A05 | G06 | G06-C01…C05, G06-C08, G06-C09 | `security-headers-contract.spec.ts`, `csp-policy.spec.ts`, `csp-mode.spec.ts`, `g06-csp-mode-deploy.spec.ts`, `csp-violations.spec.ts` | PASS | `CSP_MODE=enforce` remoto (ver Operaciones externas y Estado final tras HU-180) |
| C008 | HSTS explícito en la API | A02 | G06 | G06-C06 | `g06-hsts.spec.ts` | PASS | — |
| C049 (parcial) | `COOKIE_SECURE` cableado en el deploy; TLS local T17/T18/T21 | A02/A07 | G06 | G06-C07, G06-C08 | `g06-cookie-secure.spec.ts`, `g06-topology-tls.spec.ts` | PASS | `COOKIE_SECURE=true` remoto con todo el tráfico HTTPS |
| NBD-1 | Sonda de caducidad del certificado | A02 | G06 | G06-C10 | `g06-tls-expiry-probe.spec.ts` | PASS | Programar la sonda contra producción |
| C026 | Redacción recursiva del log técnico | A09/A04 | G05 | G05-C01 | `g05-audit-redaction.spec.ts` | PASS | — |
| C037 | Eventos de seguridad (login, bloqueo, reset, estado de cuenta, IP confiable) sin PII ni secretos; visibilidad protegida; contrato de exportación | A09/A01 | G05 | G05-C02…C10 | `g05-security-event-catalog.spec.ts`, `g05-security-event-writer.spec.ts`, `g05-auth-security-events.spec.ts`, `g05-account-locked-event.spec.ts`, `g05-password-reset-events.spec.ts`, `g05-user-status-events.spec.ts`, `g05-ip-trust.spec.ts`, `g05-export-event-contract.spec.ts`, integración `g05-security-event-visibility` | PASS | — |
| C038 | Alerta de ráfaga a admins detrás de `SECURITY_ALERTS_ENABLED` | A09 | G05 | G05-C11…C13 | `g05-security-alert-migration.spec.ts`, `g05-security-alerts.spec.ts`, integración `g05-security-alerts`, `security-alert-notification.spec.ts` | PASS | `SECURITY_ALERTS_ENABLED=true` y migración en producción (ver Operaciones externas y Estado final tras HU-180) |
| C025 | Política única de handshake WebSocket (access + ACTIVO) y desconexión al bloquear | A01/A07 | G07 | G07-C01…C04, G07-C12 | `g07-ws-auth-policy.spec.ts`, `g07-notifications-gateway-auth.spec.ts`, `g07-chat-gateway-auth.spec.ts`, `g07-account-disconnect.spec.ts`, T14 | PASS | — |
| P2 | Tiempo real same-origin y variante `PUBLIC_API_URL` | A10/A07 | G07 | G07-C05…C07 | `realtime-same-origin.spec.ts`, `chat-same-origin.spec.ts`, `g07-public-api-url-variant.spec.ts` | PASS | `PUBLIC_API_URL=same-origin` remoto (P4) |
| C027 | Solo http(s) en los 5 campos URL; enlaces seguros | A05/A04 | G07 | G07-C08, G07-C09 | `g07-url-validation.spec.ts`, `safe-links.spec.tsx` | PASS | Recuento de URL heredadas inválidas en producción |
| C006/C007 | Superficie de SQL crudo y de sumideros HTML fijada | A05/A03 | G07 | G07-C10 | `g07-raw-sql-guard.spec.ts`, `html-sink-guard.spec.ts` | PASS | — |
| VM1-N06 | Neutralización de fórmulas en CSV | A05/A04 | G07 | G07-C11 | `g07-csv-formula-neutralization.spec.ts` | PASS | — |
| T14 | Tiempo real same-origin completo en el arnés (nginx + TLS) | A01/A07/A10 | G07 | G07-C12 | `g07-topology-t14.spec.ts`, `infra/staging/realtime.mjs` | PASS | Sondas T13/T14 en producción |
| C048 | Tests de regresión de seguridad consolidados y trazables | Transversal | G08 | G08-C01…C10 | Este documento, `evidence-index.md`, verificador del delta | PASS | — |

## Riesgos residuales de código (RESIDUAL_CODE_RISK)

Riesgos de **código** conocidos que no se remedian en la Fase 2. Cada uno tiene owner, justificación y evidencia. Son distintos de las operaciones externas de la sección siguiente, que no son código.

| # | Riesgo | Origen | Owner | Justificación | Evidencia | Estado | Caducidad |
|---|---|---|---|---|---|---|---|
| R1 | Excepciones de dependencias vigentes: `deepmerge-ts` (high, CLI de Prisma), `@vitest/mocker` (moderate, desarrollo), `brace-expansion` (high, desarrollo), `esbuild` (low, desarrollo) | G03-C11 | Vernel | Sin fix seguro dentro del major o pendiente de la siguiente ventana; ninguna alcanza el servidor HTTP con datos externos | `dependency-exceptions.md` + `g03-dependency-exceptions.spec.ts` (falla al vencer) | RESIDUAL_CODE_RISK | 2026-10-31 (`brace-expansion`, `esbuild`); 2026-12-31 (resto) |
| R2 | CSP con `'unsafe-inline'` en `script-src`/`style-src`: no bloquea XSS inline | G06-C04 | Equipo frontend | Next inyecta scripts de hidratación y hay estilos inline; quitarlo exige nonces por petición (cambio de arquitectura) | `csp-policy.spec.ts`; auditoría G06 D5 | RESIDUAL_CODE_RISK | — |
| R3 | HU-159: 2 E2E del chat individual fallan de forma preexistente | Anterior a G02-C16 | Angel | Defecto al crear un chat individual sobre una base limpia; ajeno a la workstream | `evidence-index.md` → HU-159 | RESIDUAL_CODE_RISK | — |
| R4 | Contador de bloqueo por cuenta en memoria del proceso: se pierde al reiniciar y no se comparte entre instancias | G04-C05 | Vernel | Backend de una sola instancia; fail-open deliberado para que un store caído no bloquee el login; el throttler por IP sigue activo | `g04-account-attempts.spec.ts` | RESIDUAL_CODE_RISK | — |
| R5 | La cota de recuperación puede revelar por tiempo que un carné ya pidió 3 veces (no revela si existe) | G04-C07 | Vernel | Compromiso aceptado frente a mantener la búsqueda del perfil | `g04-recovery-bound.spec.ts`; auditoría G04 D7 | RESIDUAL_CODE_RISK | — |
| R6 | La referencia seudónima de cuentas desconocidas deriva de `JWT_SECRET`: al rotarlo cambian las referencias | G05-C04 | Vernel | Evita un secreto nuevo; solo afecta la correlación histórica de eventos | `g05-auth-security-events.spec.ts`; auditoría G05 D2 | RESIDUAL_CODE_RISK | — |
| R7 | Umbral de alertas de seguridad global y fijo (20 eventos en 10 min, dedup de 1 h), no por cuenta ni por IP | G05-C12 | Vernel | El contrato no fijaba valores; cambiarlo exige tocar `SECURITY_ALERT_POLICY` | `g05-security-alerts.spec.ts`; auditoría G05 D6 | RESIDUAL_CODE_RISK | — |
| R8 | El log técnico (`AuditInterceptor`) conserva su origen de IP previo con fallback a `X-Forwarded-For` | G05-C09 | Vernel / Saúl | Los eventos de seguridad ya usan la IP confiable de G04; el log técnico no es un evento de seguridad | `g05-ip-trust.spec.ts`; auditoría G05 D5 | RESIDUAL_CODE_RISK | — |
| R9 | `fotoUrl` no restringe el esquema ni el host; las subidas del navegador usan un preset sin firma | G07-C08 | Vernel / equipo | Fuera de los 5 campos del plan: es la imagen subida, no un enlace; la firma de subidas es otra decisión | `g07-url-validation.spec.ts`; auditoría G07 D3 | RESIDUAL_CODE_RISK | — |
| R10 | El E2E arranca el frontend con `next start`, no con el servidor standalone de producción | G02-C14 | Angel / Vernel | El arnés de topología sí usa el arranque real; seguimiento de representatividad | `g02-e2e-production-like.spec.ts`; auditoría G02 §12 | RESIDUAL_CODE_RISK | — |
| R11 | El seed de desarrollo incluye cuentas reales del equipo | Preexistente (auditoría G02 §12) | Angel | Se usa en E2E local; el arnés no usa seed; requiere un seed QA sintético | Auditoría G02 §12 | RESIDUAL_CODE_RISK | — |
| R12 | Controles pospuestos fuera de la Fase 2 (C050–C063) | Plan maestro §21 | Según el plan (T-212, Sprint 9) | Ver la tabla de pospuestos | Plan maestro §21 | RESIDUAL_CODE_RISK | Sprint 9 / T-212 |
| R13 | Sin cabecera `Cross-Origin-Embedder-Policy` (WARN del escaneo ZAP) | T-311 (HU-180) | Sin owner asignado | La app no usa APIs que requieran aislamiento de origen; activarla puede romper las imágenes de Cloudinary. Revisar si el frontend empieza a usar memoria compartida | `zap/README.md` §3 | RESIDUAL_CODE_RISK | — |

## Operaciones externas (OUT_OF_SCOPE_ADMIN_HANDOFF)

Responsabilidad del administrador o líder después del PR único hacia `develop`. Referencia: `09_GATE_ADMIN_HANDOFF_OWASP_2025.md`. Ese runbook no estaba disponible localmente al cerrar G08, así que no se citan IDs de acción. Ninguna de estas operaciones se ejecutó ni se verificó dentro de la workstream de código, y ninguna bloquea el `PASS` de código. Todas conservan el estado `OUT_OF_SCOPE_ADMIN_HANDOFF`. Las que se ejecutaron después, en HU-180, indican al inicio de la referencia `EXTERNAL_EXECUTED` con su fecha y evidencia; las que se reportaron sin evidencia suficiente, `PENDING_CONFIRMATION`; y las que la verificación del 2026-10-11 encontró sin aplicar, `EXTERNAL_NOT_APPLIED`. Esa verificación no está versionada en el repo.

| Operación | Gate de origen | Estado | Referencia |
|---|---|---|---|
| Revocar la clave comprometida del proveedor de correo y retirar su secreto de Actions (G01-OP-NOW-01) | G01 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G01 §13: la registra como completada por el líder/admin; G08 no lo verifica |
| Verificación post-release de la configuración segura (`.env` 0600, imagen del frontend sin secretos, G01-OP-SD-01) | G01 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G01 §13 |
| Confirmar la longitud del `JWT_SECRET` productivo antes del deploy | G01 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G01 §13 |
| Environment `production` con reviewers y job productivo vinculado (G02-C03, G02-OP-NOW-01) | G02 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G02 §5; plan maestro v2 §5 |
| Rulesets / branch protection y checks requeridos (incluye `OWASP_DELTA_ISOLATED`, «Revision de dependencias del PR» y la topología) | G02, G03, G08 | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_NOT_APPLIED al 2026-10-11: la protección de ramas no está activa. Auditorías G02 §14 y G03 §20. HU-180 T-308 (2026-10-04, commits 72ad66b9, 13443939): los rulesets `develop` y `main` existen, pero con `enforcement: disabled`. Según la verificación del equipo del 2026-10-11, no versionada en el repo, ambos siguen deshabilitados, el de `main` no tiene ninguna rama objetivo y el de `develop` apunta a `develop`. Falta habilitarlos |
| Sincronizar la rama con `develop`, resolver conflictos y hacer merge del PR | G02, G08 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G02 §15 |
| Revisar `k6.yml` de `develop` (usa credenciales productivas) | G02 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G02 §12 |
| Activar Dependency Graph, Dependabot, secret scanning y push protection | G03 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G03 §20 |
| Prueba remota con un PR negativo de dependencias (NT04) | G03 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G03 §20 |
| Aplicar la ruta P1 en el nginx vivo | G04 | OUT_OF_SCOPE_ADMIN_HANDOFF | PENDING_CONFIRMATION: Auditoría G04 §29. HU-180 T-309 §1 (2026-10-04) reporta que Socket.IO sigue funcionando por nginx tras cerrar los puertos, pero no documenta el cambio del nginx vivo ni la sonda T13. La revisión de nginx en la VM del 2026-10-11 (validación de la configuración, estado del servicio y volcado completo de la configuración; no versionada en el repo) confirma nginx activo y con configuración válida, escucha en 80 y 443 con certificado de Let's Encrypt, y `proxy_pass` hacia los puertos 3000 y 3001 en loopback, así que el proxy usa los binds en loopback. En esa salida no aparece la configuración de Socket.IO (cabeceras `Upgrade`/`Connection`), por lo que la ruta P1 sigue sin confirmarse por completo |
| Cerrar la exposición pública de los puertos de la app y activar los binds loopback (`BACKEND_BIND`, `FRONTEND_BIND`) | G04 | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_EXECUTED el 2026-10-04: HU-180 T-309 §1 y §5 (commits 99b19c31, 41af6206; PR #259). Binds en loopback en el `.env` de la VM, puertos sin respuesta desde fuera y variables de GitHub alineadas |
| Activar `TRUST_PROXY_HOPS=1` (solo tras cerrar los puertos) | G04 | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_EXECUTED el 2026-10-04, después de cerrar los puertos: HU-180 T-309 §2 y §5 (commits 991f9db1, 41af6206; PR #259) |
| Sondas T13, T16 y T19 en producción | G04 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G04 §29 |
| Activar `CSP_MODE=enforce` | G06 | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_EXECUTED el 2026-10-06: Auditoría G06 §29. HU-180 T-309 §4 (2026-10-04, commit d1fcc8e2): variable de GitHub fijada. Aplicada el 2026-10-06 por el workflow «Deploy to Azure VM», run #87, exitoso, desde `main` en el commit 1dd4faf (merge del PR #263, que contiene el PR #259), con el job «Calcular variante de build del frontend»: https://github.com/asanabria-2021067/proyecto-ingenieria-software/actions/runs/37555055165. Pendiente: la revisión visual y el re-escaneo ZAP sin el WARN de CSP, sin evidencia todavía |
| Escaneo baseline de OWASP ZAP contra producción (T-311) | G06 | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_EXECUTED el 2026-10-04: `FAIL-NEW: 0`, `WARN-NEW: 8`, `PASS: 59`, sin hallazgos altos ni medios. `zap/README.md` y `zap/zap-baseline-produccion.invalido.local-20261004.html` (commits 67704806, 1e349893; PR #259). COEP queda como R13 |
| Activar `COOKIE_SECURE=true` con todo el tráfico en HTTPS | G06 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G06 §29 |
| Verificar TLS, HSTS y cabeceras en producción (T17/T18/T21) y programar la sonda de certificado | G06 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G06 §29 |
| Dejar solo TLS 1.2 y 1.3 en `ssl_protocols` del nginx de la VM | Revisión de nginx (2026-10-11) | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_NOT_APPLIED al 2026-10-11: la configuración global de nginx tiene habilitados TLS 1.0 y TLS 1.1, protocolos obsoletos. Evidencia: revisión de nginx en la VM del 2026-10-11 (validación de la configuración, estado del servicio y volcado completo de la configuración; no versionada en el repo) |
| Retirar de `sites-enabled` el respaldo del sitio que nginx también carga | Revisión de nginx (2026-10-11) | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_NOT_APPLIED al 2026-10-11: un archivo de respaldo del sitio en `sites-enabled` se carga junto al sitio y provoca advertencias de server name duplicado en los puertos 80 y 443. Evidencia: revisión de nginx en la VM del 2026-10-11 (validación de la configuración, estado del servicio y volcado completo de la configuración; no versionada en el repo) |
| Activar `SECURITY_ALERTS_ENABLED=true` y aplicar la migración `ALERTA_SEGURIDAD` en producción | G05 | OUT_OF_SCOPE_ADMIN_HANDOFF | EXTERNAL_EXECUTED el 2026-10-04: HU-180 T-309 §3 y §5 (commits 551a99be, 41af6206; PR #259). La migración ya estaba aplicada en producción (`prisma migrate status` al día) |
| Observabilidad operacional (retención de la auditoría, visor administrativo de eventos, SIEM) | G05 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G05 §30 |
| Seleccionar `PUBLIC_API_URL=same-origin` (P4) | G07 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G07 §32 |
| Sondas T13/T14 en producción y recuento de URL heredadas inválidas en los 5 campos | G07 | OUT_OF_SCOPE_ADMIN_HANDOFF | Auditoría G07 §32 |
| Deploy, Release A/B, PRADA, tags, backups, VM, DB productiva y rollback operacional | Todos | OUT_OF_SCOPE_ADMIN_HANDOFF | Plan maestro v2 §2 |

## Controles conservados (no-regresión)

C001 (ValidationPipe), C002 (tipo de token y estado en HTTP), C003 (refresh rotado), C004 (autorización por proyecto), C005 (membresía de chat), C006 (SQL parametrizado), C007 (escape de React), C008 (Helmet), C009 (Docker no-root), C010 (BD en loopback), C011 (`npm ci`), C012 (bcrypt), C013 (almacenamiento de cierre), C014 (respuesta genérica en forgot), C015 (`returnTo` acotado), C016 (bitácora con `tx`), C017 (sesión solo en cookie) y C018 (throttler) se conservan. Sus suites existentes siguen verdes en la regresión de cada gate.

## Pospuestos y no aplicables

| Control | Estado | Motivo |
|---|---|---|
| C050 Autenticación de Redis | RESIDUAL_CODE_RISK | Pospuesto a T-212 (Angel); Redis no está publicado |
| C051 CodeQL · C052 Trivy · C053 SBOM · C054 Actions por SHA | RESIDUAL_CODE_RISK | Fuera de la Fase 2 (Sprint 9); Dependabot `github-actions` mantiene los tags |
| C055 Revocación en cascada · C056 tiempos en forgot · C057 filtro global de excepciones · C058 secreto propio de reset | RESIDUAL_CODE_RISK | Fuera de la Fase 2 (Sprint 9); C025 mitiga C058 (el claim `tipo` se exige en HTTP y WS) |
| C060 cobertura en `workflow_call` · C061 `HEALTHCHECK` · C062 rutas Next legadas · C063 MFA | RESIDUAL_CODE_RISK | Fuera de la Fase 2 |
| C064 Sanitizer HTML en backend | NOT_APPLICABLE | Revalidado en G08: no hay sumideros HTML con datos de usuario (guard G07-C10) |
| C065 Tokens CSRF | NOT_APPLICABLE | Revalidado: cookies `SameSite=Lax` (T18, G06-C08), cuerpo JSON y CORS de un solo origen |
| C066 Subresource Integrity | NOT_APPLICABLE | Revalidado: sin scripts de terceros (inventario CSP de G06-C04) |
| C067 Rate limiting en nginx | NOT_APPLICABLE | Revalidado: el throttler usa la IP real con el salto confiable de G04 |
| C068 Deserialización insegura | NOT_APPLICABLE | Solo JSON; sin serialización nativa |
| C069 Gitleaks/TruffleHog en CI | NOT_APPLICABLE | Redundante con secret scanning nativo (activación en el Gate Admin) |
| C070 `X-XSS-Protection: 1` | NOT_APPLICABLE | Cabecera obsoleta; Helmet envía `0` |
