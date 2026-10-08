# Pruebas de carga (k6)

Tres escenarios contra el backend real (`apps/backend`), nunca contra mocks:

- `scenarios/project-listing.js` — READ-ONLY: login + `GET /proyectos` +
  `GET /proyectos/:id` (el flujo de login + endpoint autenticado).
- `scenarios/kanban-operations.js` — MUTABLE: crear tarea, asignar, cerrar
  tramo. Escribe datos reales; solo correr contra un backend de pruebas.
- `scenarios/socket-io.js` — conexión real al namespace `/notifications` y,
  opcionalmente (`--trigger`), verificación de `SPRINT_FINALIZATION_STARTED`
  con dos actores.

## Cómo correrlas

Backend y Postgres arriba (`docker compose up -d postgres redis` o
equivalente local) y `K6_FIXTURE_PASSWORD` en tu `.env` de la raíz (ver
`.env.example`; el fixture no trae una contraseña por defecto), luego desde
`apps/backend`:

```bash
npm run k6:project-listing
npm run k6:kanban
npm run k6:socket-io
npm run k6:socket-io:trigger
npm run k6:baseline
```

Cada comando (`scripts/run-k6.js`) prepara primero un fixture propio de k6
(usuario líder, proyecto, Sprint ACTIVO — namespace `k6.*`, ver
`prisma/seed-k6-fixture.ts`) y solo entonces invoca `k6 run` con los ids
reales ya resueltos. No hace falta crear datos ni pasar credenciales a mano.

Para escalar carga (más VUs/iteraciones) o apuntar a otro backend:

```bash
npm run k6:project-listing -- -e K6_VUS=10 -e K6_ITERATIONS=50
npm run k6:project-listing -- -e K6_BASE_URL=http://staging:3001
```

## Medición base sin limitador

`scenarios/baseline-endpoints.js` mide solo lecturas de las secciones
principales (proyectos, tablero, sprints, equipo, actividades, bitácora,
comentarios, chat, notificaciones, catálogos, perfil, dashboard, búsqueda y
panel de administración). Por cada endpoint deja dos métricas:
`duration_<clave>` (ms) y `size_<clave>` (tamaño de la respuesta), y cada
petición lleva el tag `endpoint`. El escenario falla si recibe algún 429.

Para que mida la aplicación y no el limitador, el backend local se levanta
con `THROTTLER_DISABLED=true`. La variable solo acepta el valor exacto
`true`, por defecto el limitador sigue activo y con `NODE_ENV=production` se
ignora siempre.

Variables del escenario:

- `K6_PROJECT_ID` (obligatoria): proyecto a medir.
- `K6_USER_EMAIL` / `K6_USER_PASSWORD` (obligatorias): líder o miembro activo
  de ese proyecto.
- `K6_ADMIN_EMAIL` / `K6_ADMIN_PASSWORD` (opcionales, van juntas): si se pasan,
  también se miden los endpoints `admin_*` con esa cuenta.
- `K6_TASK_ID` / `K6_SPRINT_ID` (opcionales): por defecto se usa la primera
  tarea del tablero y el primer Sprint del proyecto.
- `K6_VUS` / `K6_ITERATIONS`: carga (por defecto 1 y 1).

Antes de medir, `setup()` recorre tres veces todos los endpoints para que el
arranque en frío del backend no entre en las métricas por endpoint.

Medición de referencia del sprint 9 (CMD, desde la raíz del repo, con el
backend local en el puerto 3002; las contraseñas son las de los usuarios del
seed):

```bat
docker run --rm -v "%cd%\k6:/k6:ro" -v "%cd%\docs\qa\sprint9:/out" grafana/k6 run -e K6_BASE_URL=http://host.docker.internal:3002 -e K6_USER_EMAIL=carlos.mendoza@uvg.edu.gt -e "K6_USER_PASSWORD=<contraseña del seed>" -e K6_ADMIN_EMAIL=admin@uvg.edu.gt -e "K6_ADMIN_PASSWORD=<contraseña del seed>" -e K6_PROJECT_ID=5 -e K6_VUS=10 -e K6_ITERATIONS=300 --summary-export=/out/k6-base.json /k6/scenarios/baseline-endpoints.js
```

`npm run k6:baseline` sigue funcionando contra el fixture `k6.*`, pero ese
proyecto está casi vacío y no sirve como referencia de rendimiento.

## Dónde queda la evidencia

k6 imprime el resumen en la terminal al terminar. Para guardar esa
evidencia (adjuntarla a un PR, por ejemplo), exportá a `k6/results/`
(ignorado por git):

```bash
npm run k6:project-listing -- --summary-export=results/project-listing.json
```

(`run-k6.js` invoca `k6 run` con cwd `k6/`, así que la ruta es relativa a esta carpeta.)
