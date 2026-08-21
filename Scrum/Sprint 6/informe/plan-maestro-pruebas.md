# Plan Maestro de Pruebas - UVG Collab

## 1. Objetivo y alcance

Definir la estrategia de pruebas del proyecto UVG Collab (apps/frontend en Next.js y apps/backend en NestJS) para garantizar la calidad funcional, la estabilidad de las integraciones con PostgreSQL y Redis, y la confiabilidad del pipeline de despliegue continuo. El alcance cubre pruebas unitarias, de integracion, de humo end-to-end, de carga y de seguridad sobre las apps del monorepo.

## 2. Estrategia por nivel

- **Unitarias (Vitest)**: cubren servicios, controladores, hooks y utilidades de forma aislada en `apps/backend` y `apps/frontend`, ejecutadas con `npm run test` en cada paquete.
- **Integracion**: pruebas en `apps/backend/test/integration/` que levantan una instancia efimera de PostgreSQL y corren en serie contra el schema real de Prisma, validando invariantes de negocio y reglas transaccionales.
- **E2E de humo (Playwright)**: 3 flujos criticos: registro y postulacion a proyecto, kanban con drag & drop, y recuperacion de contraseña.
- **Carga (k6)**: escenarios definidos en `k6/scenarios/`: `kanban-operations.js`, `project-listing.js`, `socket-io.js`.
- **Seguridad**: revision de dependencias, cabeceras HTTP (helmet ya integrado en backend) y validacion de entradas en endpoints publicos.

## 3. Criterios de entrada/salida

**Entrada**: rama con cambios mergeados a `develop`, dependencias instaladas via `npm ci`, base de datos de pruebas disponible, workflow `ci.yml` en verde para lint (no bloqueante) y pruebas unitarias/integracion (bloqueante).

**Salida**: suite de pruebas unitarias e integracion en verde, sin regresiones en los 3 flujos de humo E2E, sin hallazgos criticos o altos abiertos en la revision de seguridad.

## 4. Umbrales de cobertura

PENDIENTE: confirmar con resultados de T-123.

## 5. Entornos

- **CI**: GitHub Actions, workflow `ci.yml` (lint + pruebas unitarias/integracion en cada PR y push a `develop`/`main`), invocado tambien por `deploy.yml` antes de construir y desplegar.
- **Despliegue**: VM Azure con Docker Compose detras de un reverse proxy Nginx, imagenes publicadas en GHCR.

## 6. Matriz de trazabilidad

Archivos reales bajo `apps/backend/test/integration/`:

- assignment-closure-concurrency.integration.spec.ts
- assignment-hours-immutability.integration.spec.ts
- early-recognition-no-double-count.integration.spec.ts
- exit-lifecycle-e2e.integration.spec.ts
- exit-request-resolution.integration.spec.ts
- foundation-invariants.integration.spec.ts
- harness-isolation.integration.spec.ts
- hours-participation-sprint-uniqueness.integration.spec.ts
- hours-recognition-idempotency.integration.spec.ts
- member-detail-by-sprint.integration.spec.ts
- partial-index-invariants.integration.spec.ts
- project-closure-sprint-gate.integration.spec.ts
- projects-team-summary.integration.spec.ts
- project-write-guard.integration.spec.ts
- project-write-guard-exit-requests.integration.spec.ts
- solicitudes-salida.integration.spec.ts
- sprint-closing-summary.integration.spec.ts
- sprint-closure.integration.spec.ts
- sprint-finalization.integration.spec.ts
- sprint-history-isolation.integration.spec.ts
- sprint-lifecycle-e2e.integration.spec.ts
- sprint-operable.integration.spec.ts

(La carpeta `setup/` contiene la infraestructura compartida de arranque de las pruebas, no casos de prueba individuales.)

## 7. Riesgos y mitigacion

- **Pruebas de integracion en serie**: al depender de una unica instancia de PostgreSQL efimera, un aumento en el numero de specs puede alargar el tiempo de CI. Mitigacion: mantener el aislamiento por harness (`harness-isolation.integration.spec.ts`) y evaluar paralelizacion futura si el tiempo se vuelve un cuello de botella.
- **Flujos E2E dependientes de servicios externos** (Cloudinary, Resend): pueden generar pruebas inestables si no se mockean correctamente. Mitigacion: usar credenciales/mocks de entorno de prueba dedicados.
- **Pruebas de carga (k6) no integradas aun a CI**: al no correr automaticamente, pueden quedar desactualizadas respecto al codigo. Mitigacion: ejecutarlas manualmente antes de cada release mayor hasta que se integren al pipeline.
