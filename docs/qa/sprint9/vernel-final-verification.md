# Sprint 9 — Verificación final de las tareas de Vernel

Regresión de cierre sobre `sprint9/vernel-workstream` en `74e9a64b`, ejecutada
el 2026-10-11. El estado de cada tarea está en `vernel-backlog-acceptance.md`;
este documento recoge qué se ejecutó y qué salió.

**Veredicto: `PASS_CODE_WITH_EXTERNAL_BLOCKERS`.** Todo lo que se puede ejecutar
desde esta rama pasa. No son diez de diez: dos tareas dependen de algo externo
y una no tiene la evidencia de CI que pide.

## Entorno

- Pila desechable creada desde cero para esta corrida
  (`scripts/e2e/isolated-stack.sh`): PostgreSQL 17 y Redis 7 en memoria, solo en
  loopback, con migraciones y seed aplicados sobre ella.
- Frontend servido desde el build de producción.
- La base de desarrollo no recibió ninguna conexión, migración ni escritura.

## Resultados

Cada fila es un comando ejecutado en esta corrida, con su código de salida.

| Comprobación | Resultado | Código |
|---|---|---:|
| Backend: `tsc --noEmit -p tsconfig.build.json` | Sin errores | 0 |
| Backend: `npm run lint` | 0 errores (25 avisos previos de `any`) | 0 |
| Backend: suite unitaria | 226 archivos, **3891/3891** | 0 |
| Backend: suite de integración (base desechable) | 67 archivos, **349/349** | 0 |
| Frontend: `tsc --noEmit` | Sin errores | 0 |
| Frontend: `npm run lint` | Sin errores | 0 |
| Frontend: suite unitaria | 239 archivos, **3977/3977** | 0 |
| Frontend: build de producción | Correcto | 0 |
| E2E completo en Chromium (24 archivos) | **162/162** | 0 |
| Respaldos: contrato con binarios simulados | 83/83 | 0 |
| Respaldos: PostgreSQL 17 real y desechable | 24/24 | 0 |

Ninguna prueba se omitió ni se marcó como pendiente.

### Qué cubre el E2E de cada tarea

| Tarea | Spec |
|---|---|
| T-310 | `admin-security-access.spec.ts`, `admin-security-events.spec.ts` |
| T-328 | `profile-notification-preferences.spec.ts` |
| T-319, T-321 | `admin-navigation-own-flows.spec.ts` |
| T-317 | `a11y-keyboard-regression.spec.ts` |
| T-318 | `accesibilidad.spec.ts`, `a11y-gate-contract.spec.ts` |
| T-293 | `frontend-lazy-loading.spec.ts` |

T-320 se verifica con pruebas unitarias que recorren el árbol administrativo;
T-316 con su arnés (`scripts/qa/sprint9-a11y-audit.mjs`), ejecutado en su
momento y no repetido aquí; T-313 con sus dos scripts de prueba.

El resto de la suite (calendario, chat, kanban, actividades, certificación
posintegración) es de otras tareas: se ejecutó completa como regresión y pasa,
pero no se presenta como cobertura propia.

### Bundle

Medido de nuevo sobre el build de esta corrida, coincide con
`frontend-lazy-baseline.md`: `/dashboard/admin` 324 381 bytes gzip, `/`
288 104 y `/dashboard` 322 665.

## Git

| Comprobación | Resultado |
|---|---|
| Commits del programa sobre `20c6667c` | 52 (51 de FG01–FG13 y la matriz de aceptación) |
| Autor y committer | `Junjey123-mx <verneljosue@gmail.com>` en los 52 |
| Atribución a herramientas o coautores | Ninguna |
| `.env`, volcados o archivos de `.claude/` en los cambios | Ninguno |
| Bases integradas `07d85dde` y `15394870` | Siguen siendo ancestros |
| Push, merge, rebase, amend, reset | Ninguno |

## Lo que esta corrida no demuestra

| Qué | Tarea | Por qué |
|---|---|---|
| El paso de accesibilidad en GitHub Actions | T-318 | La rama no se ha publicado: no hay ninguna ejecución remota |
| Un respaldo diario funcionando | T-313 | El cron no está instalado en ningún servidor |
| «Cuentas pendientes» en el menú | T-321 | La pantalla está en `develop` (PR #270), no en esta rama |
| Interruptor de Chat | T-328 | El backend no tiene ese tipo de notificación |
| Conformidad WCAG 2.1 AA | T-317 | Queda un criterio de nivel A en dos componentes compartidos |
| Compatibilidad con `develop` actual | — | `develop` va 50 commits por delante de la base integrada; no se probó la fusión |
| Tiempos de carga | T-293 | Se midió tamaño de JS, no LCP |

## Siguiente paso

Publicar la rama o integrar `develop` son decisiones del propietario. Al
integrar `develop` conviene repetir esta misma corrida: es la primera vez que
este trabajo se encontraría con el PR #270 y lo fusionado después.
