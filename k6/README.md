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
equivalente local), luego desde `apps/backend`:

```bash
npm run k6:project-listing
npm run k6:kanban
npm run k6:socket-io
npm run k6:socket-io:trigger
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

## Dónde queda la evidencia

k6 imprime el resumen en la terminal al terminar. Para guardar esa
evidencia (adjuntarla a un PR, por ejemplo), exportá a `k6/results/`
(ignorado por git):

```bash
npm run k6:project-listing -- --summary-export=results/project-listing.json
```

(`run-k6.js` invoca `k6 run` con cwd `k6/`, así que la ruta es relativa a esta carpeta.)
