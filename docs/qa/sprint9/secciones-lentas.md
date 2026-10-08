# Sprint 9 — Las cinco secciones más lentas y su causa probable

Medición base de lecturas de la API con k6, sin limitador de peticiones,
contra un backend local. Resultado completo: `docs/qa/sprint9/k6-base.json`.

## Resumen

| # | Sección | Endpoint | p95 | Causa principal | Responsable |
|---|---|---|---|---|---|
| 1 | Tablero (kanban) | `GET /proyectos/:id/tareas` | 206 ms | Devuelve las 236 tareas sin paginar (100 KB) con cuatro relaciones cada una | Samuel (T-292), Saúl (T-291), Vernel (T-293) |
| 2 | Detalle de Sprint | `GET /proyectos/:id/sprints/:sprintId` | 164 ms | `include` profundo: todas las columnas de cada tarea con todas sus asignaciones y comentarios (69 KB) | Saúl (T-291), Samuel (T-292) |
| 3 | Detalle de proyecto | `GET /proyectos/:id` | 155 ms | El detalle público embebe todas las tareas del proyecto (51 KB) y se pide solo para saber quién es el líder | Samuel (T-292), Saúl (T-291) |
| 4 | Panel de administración | `GET /admin/estadisticas` | 143 ms | N+1: una agregación de horas por cada estudiante en riesgo, más siete conteos sin índice ni caché | Saúl (T-291), Samuel (T-292), Vernel (T-293) |
| 5 | Sesión del usuario | `GET /usuarios/me` | 117 ms | Carga el perfil completo (seis relaciones) en cada pantalla del dashboard | Saúl (T-291), Samuel (T-292) |

Todos los p95 están por debajo de 210 ms porque la base local es pequeña. El
orden relativo es lo que importa: estas cinco son las que más crecen con el
volumen de datos.

## Parámetros de la medición

| Parámetro | Valor |
|---|---|
| Escenario | `k6/scenarios/baseline-endpoints.js` (37 endpoints, solo `GET`) |
| Carga | 10 usuarios virtuales, 300 iteraciones compartidas |
| Peticiones | 11 215 en 56 s (≈199 peticiones/s), 0 fallidas, 0 respuestas 429 |
| Backend | Local, `nest start`, `NODE_ENV=development`, `THROTTLER_DISABLED=true`, puerto 3002 |
| Base de datos | Postgres local de docker compose (`localhost:5433`) |
| Redis | Contenedor temporal `redis:7-alpine` en el puerto 6380 |
| k6 | Imagen `grafana/k6`, apuntando a `host.docker.internal:3002` |
| Proyecto | 5 — "Portal de Empleo UVG" (`PUBLICADO`) |
| Usuario | `carlos.mendoza@uvg.edu.gt`, líder y creador del proyecto (usuario del seed) |
| Usuario administrador | `admin@uvg.edu.gt` (usuario del seed), solo para los endpoints `admin_*` |
| Tarea y Sprint | Tarea 6 y Sprint 4, los primeros que devuelve el proyecto |

Antes de medir, el escenario recorre tres veces todos los endpoints. Así el
arranque en frío del backend (que añadía unos 2 s a la primera petición de
algunos endpoints) no entra en las métricas por endpoint.

### Volumen de datos

| Dato | Cantidad |
|---|---|
| Tareas del proyecto 5 | 236, todas en el Sprint 4 |
| Sprints / hitos / etiquetas del proyecto | 1 / 1 / 3 |
| Miembros activos | 2, más el líder |
| Asignaciones de tareas | 6 |
| Comentarios, conversaciones, mensajes, actividades y eventos | 0 en toda la base |
| Proyectos / usuarios en la base | 21 / 38 |
| Notificaciones | 150 en total; 144 del administrador, 0 del líder |
| Registros de bitácora | 534 |

## Todos los endpoints medidos

Tiempos en milisegundos. El tamaño es el promedio del cuerpo de la respuesta.

| # | Clave | Endpoint | p95 | p99 | Máximo | Tamaño |
|---|---|---|---|---|---|---|
| 1 | `board` | `/proyectos/5/tareas` | 206 | 270 | 284 | 100.1 KB |
| 2 | `sprint_detail` | `/proyectos/5/sprints/4` | 164 | 259 | 291 | 68.5 KB |
| 3 | `project_detail` | `/proyectos/5` | 155 | 194 | 212 | 51.3 KB |
| 4 | `admin_stats` | `/admin/estadisticas` | 143 | 205 | 247 | 1.3 KB |
| 5 | `me` | `/usuarios/me` | 117 | 162 | 167 | 2.6 KB |
| 6 | `project_list` | `/proyectos` | 115 | 161 | 176 | 6.2 KB |
| 7 | `my_projects` | `/proyectos/mis-proyectos` | 113 | 132 | 138 | 3.4 KB |
| 8 | `members_summary` | `/proyectos/5/miembros/resumen` | 103 | 163 | 178 | 704 B |
| 9 | `task_detail` | `/proyectos/5/tareas/6` | 102 | 152 | 177 | 603 B |
| 10 | `dashboard` | `/usuarios/me/dashboard` | 99 | 136 | 154 | 1.3 KB |
| 11 | `sprint_burndown` | `/proyectos/5/sprints/4/burndown` | 86 | 141 | 144 | 163 B |
| 12 | `profile` | `/usuarios/me/perfil` | 83 | 100 | 136 | 2.3 KB |
| 13 | `sprint_analytics` | `/proyectos/5/sprints/analytics` | 80 | 121 | 164 | 217 B |
| 14 | `admin_metrics` | `/admin/metricas` | 79 | 86 | 93 | 1.0 KB |
| 15 | `admin_users` | `/admin/usuarios` | 69 | 99 | 105 | 1.9 KB |
| 16 | `admin_projects` | `/admin/proyectos?grupo=activos` | 69 | 93 | 134 | 2.7 KB |
| 17 | `my_hours` | `/usuarios/me/horas` | 68 | 93 | 115 | 980 B |
| 18 | `search` | `/busqueda?q=uvg` | 66 | 122 | 152 | 525 B |
| 19 | `roles` | `/proyectos/5/roles` | 66 | 88 | 92 | 472 B |
| 20 | `sprints` | `/proyectos/5/sprints` | 65 | 84 | 98 | 196 B |
| 21 | `team` | `/proyectos/5/equipo` | 64 | 78 | 81 | 753 B |
| 22 | `admin_review_inbox` | `/revisiones/admin/bandeja` | 64 | 72 | 86 | 999 B |
| 23 | `my_applications` | `/postulaciones/mis-postulaciones` | 62 | 86 | 92 | 1.1 KB |
| 24 | `bitacora` | `/proyectos/5/bitacora` | 56 | 75 | 82 | 7.6 KB |
| 25 | `admin_notifications` | `/notificaciones` (como administrador) | 56 | 66 | 74 | 45.2 KB |
| 26 | `project_progress` | `/proyectos/5/avance` | 54 | 62 | 71 | 158 B |
| 27 | `task_comments` | `/proyectos/5/tareas/6/comentarios` | 53 | 88 | 98 | 2 B |
| 28 | `project_comments` | `/comentarios/proyecto/5` | 52 | 86 | 96 | 2 B |
| 29 | `events` | `/proyectos/5/eventos` | 48 | 54 | 65 | 2 B |
| 30 | `activities` | `/proyectos/5/actividades` | 47 | 58 | 62 | 2 B |
| 31 | `my_tasks` | `/usuarios/me/tareas` | 47 | 55 | 63 | 2 B |
| 32 | `chat_project` | `/proyectos/5/conversaciones` | 45 | 54 | 68 | 2 B |
| 33 | `chat_dock` | `/chats` | 39 | 54 | 56 | 2 B |
| 34 | `notifications_unread_count` | `/notificaciones/mias/conteo-no-leidas` | 33 | 43 | 54 | 11 B |
| 35 | `notifications` | `/notificaciones` | 32 | 40 | 41 | 2 B |
| 36 | `catalogs` | `/catalogs` | 29 | 37 | 42 | 1.3 KB |
| 37 | `featured_projects` | `/proyectos/destacados` | 12 | 15 | 16 | 3.1 KB |

Las respuestas de 2 B son arreglos vacíos: la base local no tiene comentarios,
chat, actividades ni eventos, y el líder no tiene notificaciones ni tareas
asignadas. Esos tiempos miden solo autenticación y permisos, no la sección
con datos.

## Las cinco secciones más lentas

### 1. Tablero — `GET /proyectos/:id/tareas` (p95 206 ms, 100 KB)

**Causa probable:** listado sin paginación con varias relaciones por tarea.

**Evidencia:**

- `apps/backend/src/tasks/tasks.service.ts`, `TasksService.findAll` (línea
  300): `prisma.tarea.findMany` sin `take` ni `skip`; devuelve las 236 tareas
  y las ordena en memoria con `rows.map(mapTarea).sort(compareTareas)`.
- `TASK_SELECT` (línea 46 del mismo archivo): por cada tarea carga `hito`,
  `rolProyecto`, `asignaciones` con su `usuario`, `etiquetas` con su
  `etiqueta` y un `_count` de comentarios.
- `apps/backend/prisma/schema.prisma`: `AsignacionTarea` no tiene índice por
  `idTarea` (solo `[idUsuario, desasignadaEn]`, `[idParticipacion]` y
  `[origenReporte, reconocidoEn]`) y `Comentario` no tiene ningún índice. El
  tablero filtra ambas tablas por `idTarea`.
- Frontend: `apps/frontend/components/projects/task-board.tsx` dibuja todas
  las tarjetas de cada columna con `tareasColumna.map(renderCard)` (línea
  220), sin virtualización, e importa `@dnd-kit/core` de forma estática.

**Arreglo que corresponde:**

- Samuel (T-292): paginar o cargar por columna.
- Saúl (T-291): índices `asignacion_tarea(id_tarea)` y
  `comentario(id_tarea)`.
- Vernel (T-293): virtualizar las columnas y cargar el arrastre de forma
  diferida.

### 2. Detalle de Sprint — `GET /proyectos/:id/sprints/:sprintId` (p95 164 ms, 69 KB)

**Causa probable:** `include` profundo y sin límite.

**Evidencia:**

- `apps/backend/src/sprints/sprints.service.ts`, `SprintsService.getSprintDetail`
  (línea 1260): `prisma.sprint.findFirst` con `include: { tareas: { include:
  { asignaciones: { include: usuario }, comentarios: { include: autor } } } }`.
  Usa `include`, así que trae todas las columnas de cada tarea, todas sus
  asignaciones (también las cerradas) y todos sus comentarios.
- Después lanza dos consultas más para los hitos (`hito.findMany` y
  `tarea.findMany` con todas las tareas de esos hitos).
- Mismos índices faltantes que en el tablero: `asignacion_tarea(id_tarea)` y
  `comentario(id_tarea)`.

**Arreglo que corresponde:**

- Saúl (T-291): cambiar `include` por un `select` acotado y agregar los
  índices.
- Samuel (T-292): paginar las tareas del Sprint o servir los comentarios
  aparte.

Con 0 comentarios en la base local este endpoint ya pesa 69 KB; con
comentarios reales crecerá más que el tablero.

### 3. Detalle de proyecto — `GET /proyectos/:id` (p95 155 ms, 51 KB)

**Causa probable:** respuesta demasiado grande para lo que se usa.

**Evidencia:**

- `apps/backend/src/projects/projects.service.ts`, `ProjectsService.findOne`
  (línea 574) usa `proyectoDetalleSelect` (línea 193), que embebe
  organizaciones, intereses, roles con requisitos y habilidades, hitos y
  **todas las tareas del proyecto** con descripción y un `_count` de
  comentarios por tarea.
- El endpoint es público (sin guard en `projects.controller.ts`, línea 108) y
  no usa caché.
- Frontend: `apps/frontend/hooks/use-is-project-leader.ts` llama a
  `useProjectDetail` solo para leer `creadoPor`, así que varias pantallas del
  proyecto descargan los 51 KB para saber si el usuario es líder.

**Arreglo que corresponde:**

- Samuel (T-292): sacar las tareas del detalle (o paginarlas) y cachear la
  respuesta pública.
- Saúl (T-291): índice `comentario(id_tarea)` para el `_count`.

### 4. Panel de administración — `GET /admin/estadisticas` (p95 143 ms, 1.3 KB)

**Causa probable:** consultas N+1 y conteos sin índice. Es el único del top 5
con respuesta pequeña: todo el tiempo se va en consultas.

**Evidencia:**

- `apps/backend/src/admin/admin.service.ts`, `AdminService.getEstadisticas`
  (línea 65): siete `count` en paralelo, dos `findMany` y después
  `perfilesRiesgo.map(async ...)` (línea 132), que ejecuta un
  `horasParticipacion.aggregate` por cada estudiante (hasta 20). Son hasta 29
  consultas por petición; en la base local hay 5 estudiantes en riesgo, así
  que fueron al menos 14.
- `schema.prisma`: `Proyecto` no tiene índices (se filtra por
  `estadoProyecto`, `eliminadoEn` y `fechaActualizacion`), `Usuario` no tiene
  índice por `estado` y `HorasParticipacion` no tiene índice por
  `idParticipacion`.
- No usa caché, aunque son totales globales que cambian poco.
- Frontend: `apps/frontend/app/dashboard/admin/page.tsx` (línea 17) importa
  `AdminMetricsSection` de forma estática, y ese componente importa
  `recharts`.

**Arreglo que corresponde:**

- Saúl (T-291): reemplazar el N+1 por un solo `groupBy` y agregar los
  índices.
- Samuel (T-292): cachear el resultado en Redis con TTL corto.
- Vernel (T-293): cargar la sección de gráficas con `dynamic()`.

### 5. Sesión del usuario — `GET /usuarios/me` (p95 117 ms, 2.6 KB)

**Causa probable:** `select` de más en una petición que se repite en todas las
pantallas.

**Evidencia:**

- `apps/backend/src/users/users.service.ts`, `UsersService.getMe` (línea 25):
  carga `perfil` con `carrera`, `habilidades`, `intereses`, `cualidades`,
  `experiencias` y `rolesAcceso`, cada una con su catálogo.
- Frontend: `apps/frontend/components/dashboard/DashboardLayout.tsx` (línea
  109) llama a `useCurrentUser` en todo el dashboard, y solo necesita nombre,
  foto y roles. `use-current-user.ts` ya define `staleTime` de 5 minutos, así
  que el costo está en el backend.

**Arreglo que corresponde:**

- Saúl (T-291): `select` mínimo para la sesión; el perfil completo ya tiene
  su propio endpoint (`/usuarios/me/perfil`).
- Samuel (T-292): cachear la sesión por usuario.

## Hallazgos que afectan a todas las secciones

- **La caché no llega a Redis.** `apps/backend/src/app.module.ts` registra
  `CacheModule` con `store: redisStore`, pero tras las 11 215 peticiones el
  Redis de la medición tenía 0 claves (`redis-cli dbsize`). La caché funciona
  en memoria del proceso: `/proyectos/destacados`, el único endpoint que la
  usa (`projects.service.ts`, línea 766), respondió en 12 ms de p95. Samuel
  (T-292) debería revisar esta configuración antes de agregar más caché.
- **Una consulta extra por petición autenticada.**
  `apps/backend/src/auth/jwt.strategy.ts`, `validate` (línea 32), consulta el
  estado del usuario en cada petición. Contribuye al piso de unos 30 ms de p95
  que tienen incluso los endpoints que devuelven un arreglo vacío.

## Lo que no se pudo medir

- **First Load JS de Next.js.** `next build` falla en esta máquina porque
  `leaflet` y `react-leaflet` están en `apps/frontend/package.json` pero no
  instalados en `node_modules` (los usa `components/calendar/event-location-picker.tsx`).
  Hay que correr `npm install` en `apps/frontend` y repetir `npx next build`.
  La evidencia de frontend de este documento sale de leer el código, no de
  tamaños de bundle.
- **Chat, comentarios, actividades, asistencia y eventos con datos.** La base
  local no tiene ninguna fila en esas tablas.
- **Notificaciones del líder.** Tiene 0; se midieron con el administrador
  (`admin_notifications`, 100 notificaciones, 45 KB, sin paginación).

## Medición después

La base anterior usaba el proyecto del fixture de k6, casi vacío. Se volvió a
medir con el proyecto 5, que es el que más datos tiene en la base local, y
`k6-base.json` se reemplazó con este resultado.

La medición posterior a las mejoras debe usar exactamente lo mismo para ser
comparable:

- El mismo escenario, `k6/scenarios/baseline-endpoints.js`, sin cambios.
- El mismo proyecto (5), el mismo usuario líder y el mismo administrador.
- Los mismos parámetros: 10 usuarios virtuales y 300 iteraciones, con el
  limitador apagado.
- La misma base local, sin volver a sembrar ni borrar datos entre una y otra.

El comando completo está en `k6/README.md`, sección "Medición base sin
limitador".
