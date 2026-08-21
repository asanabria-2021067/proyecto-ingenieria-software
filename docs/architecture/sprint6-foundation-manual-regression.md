# Sprint 6 Shared Foundation — Manual Regression Walkthrough

## Metadata

- Fecha: 2026-08-05
- Rama: `refactor/sprint6-shared-foundation`
- HEAD: `e499099afbeb90e1049065782247c2711a8f86c9`
- Ejecutor: agente Claude Code, sesión no interactiva, para la parte automatizada; recorrido manual A-G ejecutado y confirmado por el operador humano del proyecto.
- **Actualización**: la versión inicial de este documento (misma fecha) dejó los escenarios A-G como `NOT VERIFIED` porque la sesión del agente no disponía de herramientas de automatización de navegador ni de sesión de usuario real. El operador humano completó posteriormente el recorrido manual completo A-G directamente sobre la aplicación y confirmó explícitamente: *"Sí sirve todo."* Este documento se actualiza para reflejar esa verificación real.

## Baseline

Baseline oficial (Tarea 1):

| Archivo | Líneas |
|---|---:|
| project-detail-client.tsx | 661 |
| my-project-view-client.tsx | 999 |
| proyectos/[id]/page.tsx | 463 |
| kanban-workspace-client.tsx | 584 |

Frontend baseline: 42 test files, 457 passed, 0 failed, 0 skipped.

Backend baseline: 62 test files, 60 suites passed, 2 skipped, 1225 passed, 10 skipped, 0 failed.

Real DB baseline: `roles-participation.integration.spec.ts` — 7 skipped, gate `ROLES_IT_DATABASE_URL`.

Nuevo harness (T14-T18): `INTEGRATION_DATABASE_URL`, suite `partial-index-invariants.integration.spec.ts`.

## Environment

- `git status --short` inicial: `?? .claude/` (preexistente, protegido, sin tocar).
- `INTEGRATION_DATABASE_URL`: **NOT SET** (verificado sin imprimir valor).
- Todas las tareas T2-T18 están commiteadas; HEAD coincide exactamente con el último commit de T18 (`e499099`, "add smoke test for PostgreSQL partial unique index").
- El agente no levantó la aplicación en un navegador real (esta sesión carece de herramientas de interacción de navegador). El recorrido manual real A-G fue ejecutado directamente por el operador humano contra la aplicación levantada, fuera de esta sesión, y reportado de vuelta al agente para su registro.

## Manual Scenarios

| Escenario | Executed | Result |
|---|---|---|
| A líder | SÍ | PASS |
| B participante | SÍ | PASS |
| C candidato | SÍ | PASS |
| D my-project actual | SÍ | PASS |
| E snapshot | SÍ | PASS |
| F sin snapshot | SÍ | PASS |
| G equipo legacy | SÍ | PASS |

### A. Project detail — leader

```text
EXECUTED: SÍ
RESULT: PASS
```
Verificado manualmente por el operador; sin regresiones observables.

### B. Project detail — participant

```text
EXECUTED: SÍ
RESULT: PASS
```
Verificado manualmente por el operador; sin regresiones observables.

### C. Public/candidate project detail

```text
EXECUTED: SÍ
RESULT: PASS
```
Verificado manualmente por el operador (con y sin postulación activa); sin regresiones observables.

### D. My project — current view

```text
EXECUTED: SÍ
RESULT: PASS
```
Verificado manualmente por el operador; sin regresiones observables.

### E. My project — snapshot available

```text
EXECUTED: SÍ
RESULT: PASS
```
Escenario marcado como CRÍTICO por T12/T12.B. Verificado manualmente por el operador; sin regresiones observables.

### F. My project — no snapshot

```text
EXECUTED: SÍ
RESULT: PASS
```
Escenario marcado como CRÍTICO. Verificado manualmente por el operador; sin regresiones observables.

### G. Legacy team view

```text
EXECUTED: SÍ
RESULT: PASS
```
Verificado manualmente por el operador; sin regresiones observables.

## Automated Regression

### Frontend (suite completa)

```
Comando: npx vitest run   (desde apps/frontend)
Test Files: 42 passed (42)
Tests: 457 passed (457)
Failed: 0
Skipped: 0
```
Coincide exactamente con el baseline de Tarea 1 (457 passed, 0 failed).

### Backend (suite completa)

```
Comando: npx vitest run   (desde apps/backend)
Test Files: 60 passed | 3 skipped (63)
Tests: 1225 passed | 11 skipped (1236)
Failed: 0
```
Comparado con baseline (60 passed, 2 skipped de 62; 1225 passed, 10 skipped): el incremento de +1 suite skipped y +1 test skipped corresponde exactamente a la nueva suite gateada `test/integration/partial-index-invariants.integration.spec.ts` (1 test) agregada en T18, que permanece skipped por ausencia de `INTEGRATION_DATABASE_URL` — no es una regresión, es el comportamiento esperado y documentado en T18. `roles-participation.integration.spec.ts` sigue en 7 skipped, sin cambios. **0 failed** en ambos frontend y backend.

## Directed Suites

| Suite | Resultado |
|---|---|
| `project-detail-view.spec.ts` | 5/5 passed |
| `project-detail-leader.spec.ts` | 8/8 passed |
| `project-detail-task-navigation.spec.ts` | 8/8 passed |
| `project-roles-sheet.spec.ts` | 16/16 passed |
| `role-admin-card.spec.ts` | 5/5 passed |
| `use-project-members.spec.ts` | 5/5 passed |
| `partial-index-invariants.integration.spec.ts` | 1 skipped (gate limpio, sin intento de conexión) |
| `roles-participation.integration.spec.ts` | 7 skipped (gate limpio, sin cambios) |

Total suites dirigidas frontend: 6 archivos, 47/47 tests passed, 0 failed.

Lint dirigido de verificación (sin `--fix`) sobre `project-detail-client.tsx`, `my-project-view-client.tsx`, `equipo/page.tsx` y `components/projects/detail/*.tsx`: **0 errores, 0 warnings**. (Las Tareas 5-18 ya habían ejecutado lint dirigido sobre sus propios archivos individualmente; esta es una verificación adicional agregada, no un nuevo gate global — el lint global preexistente documentado en Tarea 1 no se usó como gate, según instrucción.)

## PostgreSQL Harness

```text
INTEGRATION_DATABASE_URL: NOT SET
SMOKE HARNESS: SKIPPED
POSTGRESQL REAL VALIDADO: NO
```

```text
POSTGRESQL REAL DEL NUEVO HARNESS: NO VALIDADO
```

Esto es un gate técnico pendiente por ausencia de infraestructura de base de datos disponible en este entorno, no una regresión de frontend/backend.

## Final Line Metrics

| Archivo | Baseline T1 | Actual | Cambio |
|---|---:|---:|---:|
| project-detail-client.tsx | 661 | 293 | -368 |
| my-project-view-client.tsx | 999 | 857 | -142 |
| proyectos/[id]/page.tsx | 463 | 463 | 0 |
| kanban-workspace-client.tsx | 584 | 584 | 0 |

`proyectos/[id]/page.tsx` y `kanban-workspace-client.tsx` no fueron tocados por ninguna tarea T2-T18, tal como se esperaba — 0 cambio confirmado.

## Findings

**REGRESIONES DETECTADAS: 0**

Los siete escenarios manuales (A-G) fueron ejecutados por el operador humano directamente sobre la aplicación levantada, y todos resultaron en `PASS` sin regresiones observables. No se crea ninguna entrada `REG-T19-*` porque no se reportó ningún defecto. Combinado con las suites automatizadas (frontend y backend en verde, 0 failed) y el lint dirigido limpio, no hay evidencia de ninguna regresión atribuible a las Tareas 2-18.

## Warnings / pendientes técnicos

- **Verificación PostgreSQL real (T14-T18)**: `INTEGRATION_DATABASE_URL` permanece `NOT SET` en este entorno, por lo que `partial-index-invariants.integration.spec.ts` se sigue saltando de forma limpia (sin intento de conexión) y no se ha validado el rechazo real del índice parcial contra una base de integración. Esto es una limitación técnica conocida desde T14, no una regresión, y no bloquea T20: el gating funciona correctamente y el spec se salta limpiamente tal como está diseñado.

## Blocking Items

```text
BLOQUEOS PARA T20: NINGUNO
```

## Final Gate

```text
TAREA 19: PASS WITH WARNINGS
REGRESIONES DETECTADAS: 0
POSTGRESQL REAL VALIDADO: NO
GATE T20: OPEN
```

Razón: los siete escenarios manuales obligatorios (A-G) fueron ejecutados por el operador humano y todos pasaron sin regresiones observables; el frontend y el backend completos están en verde (0 failed); las suites dirigidas relevantes pasan; el nuevo harness de integración (T14-T18) se gatea correctamente y se salta limpiamente sin `INTEGRATION_DATABASE_URL`. La única limitación pendiente es la validación contra PostgreSQL real, que es un warning técnico conocido y no una regresión, por lo que no bloquea el avance a Tarea 20.
