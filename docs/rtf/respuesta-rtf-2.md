# Respuesta a la RTF No. 2

La RTF se hizo sobre el commit `7042a2a6`. Cada punto se verificó contra `develop` (`9de56031c`) antes de corregirlo. El punto 3.8 (`COOKIE_SECURE`) ya estaba corregido y no se tocó.

## Defectos y correcciones

La severidad solo se indica donde este equipo la tiene registrada; para el resto vale la del informe.

| Defecto | Severidad | Corrección realizada | PR | Prueba que lo cubre |
|---|---|---|---|---|
| RTF-3.1 Servicios sin pruebas | Severo | Specs de `project-closure-review.service.ts` y `task-hour-adjustments.service.ts` (reglas de negocio, estados inválidos, cálculo con `Decimal`, rutas de error), spec de la matriz de roles de `ProjectPolicyService`, guard de CI para servicios nuevos sin spec y umbral global de cobertura de 60 a 65 | #337 | `project-closure-review.service.spec.ts`, `task-hour-adjustments.service.spec.ts`, `project-policy.service.spec.ts`, `scripts/check-service-specs.mjs` en CI |
| RTF-3.2 Solicitud de amistad duplicada | Ver informe | Índice único sobre el par no ordenado, `crearSolicitudAmistad` dentro de `$transaction`, `P2002` a 409 y filtro global de Prisma (`P2002` a 409, `P2025` a 404) | #336 | `amistad-solicitudes-cruzadas.integration.spec.ts`, `social.service.spec.ts`, spec del filtro |
| RTF-3.3 Servicios de más de 1.500 líneas | Ver informe | Extracción conservadora de notificaciones, caché y lecturas de `tasks`, `sprints` y `projects`; regla `max-lines` de ESLint; plan de división | #338 | Specs existentes sin modificar, más 5 specs nuevos (`projects-cache`, `projects-revisions`, `projects-affinity`, `sprints-read`, `tasks-notifications`) |
| RTF-3.4 Mensaje de chat sin transacción | Ver informe | Mensaje y `ultimaLecturaEn` en una sola transacción; difusión por socket solo tras el commit; se borra el adjunto si falla | #336 | `chat.service.spec.ts` (fallo de la segunda escritura: sin mensaje, sin difusión, adjunto borrado) |
| RTF-3.5 `onDelete` sin declarar | Ver informe | `onDelete` explícito en las 105 relaciones que no lo tenían (`Restrict` en obligatorias, `SetNull` en opcionales); criterio documentado | #336 | `prisma migrate diff` del esquema anterior al nuevo: migración vacía |
| RTF-3.6 Archivos compilados en el repositorio | Ver informe | `vitest.config.js`, `.d.ts` y `.js.map` fuera del índice, en `.gitignore`, y `tsconfig` sin emitir en la fuente | #335 | `nest build` y `tsc` sin archivos nuevos junto a la fuente |
| RTF-3.7 PR sin ticket y ramas fusionadas | Ver informe | Campo de ticket en la plantilla de PR, check de CI sobre el título, borrado automático de ramas al fusionar y limpieza de 44 ramas (lista en `docs/ramas-depuradas.md`) | #335 | Job `titulo-con-ticket` |
| RTF-3.8 `COOKIE_SECURE` | Ver informe | Ya corregido antes de esta RTF; ver P3 | - | Validación de arranque en `environment.validation.ts` y paso de validación de `deploy.yml` |
| RTF-3.9 `.only` sin bloqueo | Ver informe | `forbidOnly: !!process.env.CI` en Playwright y `allowOnly: false` en los Vitest; los `test.skip` actuales son condicionales | #337 | Un `it.only` temporal falla con «Unexpected .only modifier» |
| RTF-3.10 Ortografía | Ver informe | Tildes, ñ, signos de apertura y tuteo en los textos visibles y en «Credenciales inválidas» | #343 | `apps/frontend/test/ortografia-mensajes.spec.ts` |

## Respuestas a las preguntas

### P1. Cobertura actual medida y plan de subida

Cobertura del backend con pruebas unitarias (`vitest run --coverage`):

| | Líneas / sentencias | Funciones | Ramas |
|---|---|---|---|
| Antes de los specs nuevos (local) | 73,06 % | 70,94 % | 89,99 % |
| Después (local) | 74,94 % | 71,99 % | 90,30 % |
| CI de un PR previo a los cambios | 73,08 % | 71 % | 90 % |

El umbral global pasó de 60 a 65 en líneas, funciones y sentencias (ramas queda en 80). Plan: subir 5 puntos por release hasta 75. El guard `scripts/check-service-specs.mjs` evita que entren servicios nuevos sin spec; hoy quedan 28 servicios en su lista de excepciones, que solo puede reducirse.

### P2. Cómo se evita ahora la solicitud duplicada

- La migración `20261030110000_amistad_par_no_ordenado_unico` crea un índice único de expresión sobre `LEAST(id_usuario_solicitante, id_usuario_receptor)` y `GREATEST(...)`. Así `A→B` y `B→A` no pueden coexistir aunque lleguen a la vez.
- Antes de crear el índice, la migración elimina duplicados cruzados de forma determinista: queda la ACEPTADA (si hay varias, la de fecha más antigua y luego el menor `id_amistad`), y si ninguna está aceptada, la más antigua.
- `crearSolicitudAmistad` verifica y escribe dentro de `$transaction`. Si la base rechaza la segunda fila (`P2002`), el servicio responde 409.
- `amistad-solicitudes-cruzadas.integration.spec.ts` lanza solicitudes cruzadas simultáneas y comprueba una sola fila y ningún 500.

### P3. `COOKIE_SECURE`

- `deploy.yml` toma `COOKIE_SECURE` de la variable del repositorio y, si no existe, usa `true`; el paso de validación rechaza cualquier valor distinto de `true` o `false` y aborta el despliegue.
- En producción el backend usa `secure` por defecto (`cookie.util.ts` y `environment.validation.ts`).
- Verificación contra producción (`https://158.23.57.118.nip.io`, 2026-10-31, inicio de sesión con una cuenta de prueba): las dos cookies de sesión llegan con `HttpOnly; Secure; SameSite=Lax`.

### P4. Plan de división

Está en `docs/architecture/plan-division-servicios.md`. Resumen: esta entrega dejó `tasks.service.ts`, `sprints.service.ts` y `projects.service.ts` por debajo de 1.200 líneas (de 2.088, 1.810 y 1.580 a 1.121, 1.121 y 1.149). La regla `max-lines` de 800 es `error` para archivos nuevos y `warn` para los archivos actuales; el documento define los servicios por caso de uso, el orden, el criterio de salida y los riesgos para bajar de 800.
