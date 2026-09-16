# Pruebas de carga con k6

## Cómo correrlas (local)

No requiere pasos manuales: cada comando siembra su propio fixture aislado
(namespace `k6.*@uvg.edu.gt`, ver `apps/backend/prisma/seed-k6-fixture.ts`) y
resuelve los ids reales antes de invocar `k6 run`.

Con el stack de desarrollo arriba (`docker compose -f docker-compose.yml -f
docker-compose.dev.yml --profile app up`, o backend + Postgres locales):

```bash
cd apps/backend
npm run k6:project-listing   # K2 — solo lectura (listado + detalle de proyectos)
npm run k6:kanban            # K2 — mutable (crear tarea, asignar, cerrar tramo)
npm run k6:socket-io         # K2 — conexión Socket.IO de solo lectura
npm run k6:socket-io:trigger # K2.1 — dispara SPRINT_FINALIZATION_STARTED (dos identidades)
```

Cada script acepta argumentos extra de `k6 run` al final, p. ej.:

```bash
npm run k6:kanban -- -e K6_ITERATIONS=5
```

Variables relevantes (todas con default seguro salvo que se indique lo
contrario): `K6_BASE_URL` (default `http://localhost:3001`), `K6_VUS`,
`K6_ITERATIONS`. El detalle completo de cada variable vive en el encabezado
de `apps/backend/scripts/run-k6.js` y de cada escenario en `k6/scenarios/`.

## Contra el entorno desplegado

```bash
K6_BASE_URL=http://<host-desplegado>:3001 K6_USER_EMAIL=... K6_USER_PASSWORD=... \
  k6 run k6/scenarios/project-listing.js
```

El fixture automático (`npm run k6:*`) requiere `DATABASE_URL` apuntando a la
base del entorno objetivo — úsalo solo si tienes acceso directo a esa base de
datos. Sin ese acceso, corré el escenario de solo lectura
(`project-listing.js`) manualmente con credenciales de un usuario real que ya
exista ahí.

## Umbrales — por qué son los que son

La VM de despliegue tiene **842 MiB de RAM total**: ~430 MiB los usa el
sistema operativo, ~91 MiB los cuatro contenedores en reposo (backend,
frontend, Postgres, Redis). Quedan de margen real unos **320 MiB** para
absorber tráfico antes de que el kernel empiece a usar swap. Los umbrales de
cada escenario deben reflejar esa realidad, no la de un entorno con más
memoria: mantené los VUs bajos (1-3) salvo que estés deliberadamente
reproduciendo el punto de saturación (ver `docs/load-test-report-2026-09.md`),
y nunca copies umbrales de otro proyecto/entorno sin volver a medir acá.

## T-197 — qué estaba desfasado

`kanban-operations.js` (K-02) fallaba siempre en el paso de cierre de tramo:
mandaba `horasReales` en el body de `POST .../asignaciones/:id/cerrar`, pero
`CloseAssignmentDto` ya no tiene ese campo (el backend lo recalcula solo vía
`TimeRecordsService.recalculateAssignment`) y `ValidationPipe` corre con
`forbidNonWhitelisted: true` — cualquier propiedad extra devuelve 400.

Encontrado además al correrlo: `helpers/auth.js` (compartido por los tres
escenarios) esperaba `accessToken`/`refreshToken` en el body JSON de
`POST /auth/login`. El login ya no los devuelve ahí — desde que `auth`
migró a cookies httpOnly (`setAuthCookies`, `cookie.util.ts`), el body es
`{ mensaje: 'Sesión iniciada' }` y los tokens viajan como `Set-Cookie`. Esto
rompía `setup()` en los tres escenarios, no solo en K-02. Se corrigió leyendo
el token de `res.cookies.access_token` en vez del body; el resto de cada
escenario sigue igual porque `jwt.strategy.ts` acepta tanto la cookie como el
header `Authorization: Bearer` que ya arma `authHeaders()`.

Verificado localmente tras el fix: los tres escenarios (`k6:project-listing`,
`k6:kanban`, `k6:socket-io`) corren 100% de checks en verde contra el stack
de `docker-compose.dev.yml`.
