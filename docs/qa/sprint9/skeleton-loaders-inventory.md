# Sprint 9 · Inventario de estados de carga (HU-204, T-389)

Referencia: `docs/design-system.md` y los tokens de `apps/frontend/app/global.css`.
Se incluyen solo las rutas que existen en `apps/frontend/app` y los componentes que cargan datos dentro de ellas.

## 1. Situación de partida

| Tema | Hallazgo |
|---|---|
| Componente base | `components/ui/skeleton.tsx` (shadcn: `bg-muted animate-pulse rounded-md`, `data-slot="skeleton"`). Lo usan ~45 vistas, pero cada una compone su propio esqueleto local (`NotificacionesSkeleton`, `ViewSkeleton`, `WorkspaceSkeleton`…). La única pieza compartida es `AvailableProjectCardSkeleton`. |
| Sistema paralelo | `react-loading-skeleton` (shimmer, CSS y `SkeletonTheme` propios) en `/dashboard`, `/dashboard/personas`, `/dashboard/personas/[id]` y `/dashboard/chats/archivados`. |
| Accesibilidad | El `Skeleton` base no lleva `aria-hidden`. Los contenedores alternan entre `role="status"` + `aria-label`, solo `aria-busy`, o nada. La convención mayoritaria (y la que ya verifican `project-content-grid.spec` y `admin-navegacion-secciones.spec`) es: contenedor `role="status"` + `aria-label="Cargando …"` + `aria-busy`, hijos decorativos `aria-hidden`. |
| Movimiento reducido | `global.css` anula todas las animaciones bajo `prefers-reduced-motion: reduce`; `animate-pulse` queda estático. |
| Datos falsos | `/dashboard/perfil` muestra «0 / N/A hrs» mientras llega `getDashboardStats`. |
| E2E | Playwright (`e2e/`) contra el backend real con cuentas sembradas; helpers `login`, `desactivarTour` y `test` (vigila CSP). `page.route` ya se usa para controlar respuestas. |

## 2. Inventario

Prioridad: A = vista principal o de uso frecuente, M = media, B = baja.

### Shell y sesión

| Vista o sección | Ruta | Contenido | Estado actual | Problema | Solución propuesta | Prioridad |
|---|---|---|---|---|---|---|
| Shell estudiante (`DashboardLayout`, `app/dashboard/layout.tsx`) | `/dashboard/*` | Shell | Spinner a pantalla completa | Sin `role` ni etiqueta; bloquea la página | Skeleton de shell (detalle) | A |
| Shell admin (`AdminLayout`) | `/dashboard/admin/*` | Shell | Spinner a pantalla completa | Igual | Skeleton de shell (detalle) | A |

### Estudiante

| Vista o sección | Ruta | Contenido | Estado actual | Problema | Solución propuesta | Prioridad |
|---|---|---|---|---|---|---|
| Inicio | `/dashboard` | Tarjetas | `react-loading-skeleton` | Sistema paralelo; sin a11y | Tarjeta | A |
| Proyectos disponibles | `/dashboard/proyectos` | Tarjetas | `AvailableProjectCardSkeleton` con `status`; el filtro de organización vuelve a cargar | Correcto | Tarjeta (consolidar) | A |
| Mis proyectos | `/dashboard/projects/mine` | Tarjetas | Skeleton correcto; «Proyectos donde participo» sin estado de carga | La sección aparece de golpe | Tarjeta | A |
| Mis postulaciones | `/dashboard/mis-postulaciones` | Lista | Texto «Cargando tus postulaciones...» | Sin skeleton | Lista | A |
| Notificaciones | `/dashboard/notificaciones` | Lista | Skeleton local `aria-hidden` | Contenedor sin `role` ni etiqueta | Lista | A |
| Mis tareas | `/dashboard/mis-tareas` | Filas | Skeleton de filas con `status` | Correcto | Lista (consolidar) | A |
| Perfil | `/dashboard/perfil` | Detalle | Spinner a pantalla completa; luego «0 / N/A hrs» | Spinner y datos falsos | Detalle + bloque de estadísticas | A |
| Insignias (en perfil) | `/dashboard/perfil` | Tarjeta | Texto «Cargando insignias...» | Sin skeleton | Tarjeta | M |
| Editar perfil | `/dashboard/perfil/editar` | Formulario | Spinner + texto | Spinner | Detalle | M |
| Calendario | `/dashboard/calendario` | Rejilla y agenda | Spinner + texto; la vista mes se oculta | Hueco en blanco | Tabla (rejilla) | M |
| Calendarios compartidos (lateral) | `/dashboard/calendario` | Lista corta | Spinner pequeño con `status` | Aceptable | Lista compacta | B |
| Personas | `/dashboard/personas` | Lista | `react-loading-skeleton` | Sistema paralelo | Lista | M |
| Perfil de persona | `/dashboard/personas/[id]` | Detalle | `react-loading-skeleton` | Sistema paralelo; sin a11y | Detalle | M |
| Mis horas | `/dashboard/mis-horas` | KPI + listas | Skeleton con `aria-busy` | Sin etiqueta | Tarjeta | M |
| Chats archivados | `/dashboard/chats/archivados` | Lista | `react-loading-skeleton` | Sistema paralelo | Lista | B |
| Chat dock (lista y ventana) | Global | Lista | Texto «Cargando chats…» / «Cargando historial…» | Sin skeleton | Lista compacta | B |
| Configuración | `/dashboard/configuracion` | Formulario | Sección con skeleton y `status` | Correcto | Ninguna | B |

### Proyecto (miembro y líder)

| Vista o sección | Ruta | Contenido | Estado actual | Problema | Solución propuesta | Prioridad |
|---|---|---|---|---|---|---|
| Detalle público | `/dashboard/proyectos/[id]` | Detalle | `ProyectoDetalleSkeleton` | Sin `role` ni etiqueta | Detalle | A |
| Workspace del líder | `/dashboard/projects/[id]` | Detalle | Skeleton con `aria-busy` | Correcto | Detalle (consolidar) | A |
| Kanban | `/dashboard/projects/[id]/kanban` | Tablero | Columnas skeleton | Sin `role` ni etiqueta | Conservar columnas + región accesible | A |
| Detalle de tarea | `/dashboard/projects/[id]/kanban/tasks/[taskId]` | Detalle | Skeleton sin a11y; comentarios y horas con texto | Inconsistente | Detalle + Lista | M |
| Explorador de tareas | `/dashboard/projects/[id]/tareas` | Tabla | Skeleton con `status` | Correcto | Tabla (consolidar) | M |
| Mi proyecto (propietario) | `/dashboard/projects/mine/[id]` | Detalle | 8 barras genéricas sin a11y | No refleja la estructura | Detalle | M |
| Formulario de proyecto (edición) | `/dashboard/projects/mine/form?id=` | Formulario en modal | Texto «Cargando proyecto...» | Sin skeleton | Detalle dentro del modal | M |
| Postular a rol | `/dashboard/proyectos/[id]/postular/[rolId]` | Detalle + formulario | Texto «Cargando...» / «Validando...» | Sin skeleton | Detalle | M |
| Postulaciones del proyecto | `/dashboard/proyectos/[id]/postulaciones` | Lista | Texto | Sin skeleton | Lista | M |
| Miembros | `/dashboard/proyectos/[id]/miembros` | Lista + métricas | Skeleton; `status` sin etiqueta | a11y parcial | Lista | M |
| Postulaciones y solicitudes de salida | `…/miembros/postulaciones`, `…/miembros/solicitudes-salida` | Lista | Skeleton con etiqueta | Correcto | Lista (consolidar) | B |
| Asistencia | `/dashboard/proyectos/[id]/asistencia` | Lista | Skeleton sin etiqueta | a11y parcial | Lista | M |
| Bitácora | `/dashboard/proyectos/[id]/bitacora` | Lista | Skeleton sin etiqueta | a11y parcial | Lista | M |
| Sprints | `/dashboard/proyectos/[id]/sprints` | Lista | Skeleton correcto; spinners solo en botones | Correcto | Lista (consolidar) | M |
| Detalle de sprint | `/dashboard/proyectos/[id]/sprints/[sprintId]` | Detalle | Skeleton sin etiqueta | a11y parcial | Detalle | M |
| Analíticas, burndown y velocidad | `…/sprints/analytics`, `…/sprints/[sprintId]/analytics`, `…/informes/*` | Gráficas | `Skeleton` suelto sin a11y | Sin a11y | Tarjeta | B |
| Finalizar sprint y revisión | `…/sprints/[sprintId]/finalizar[/revision]` | Detalle | Skeleton correcto | Correcto | Ninguna | B |
| Integrante del equipo | `/dashboard/proyectos/[id]/equipo/[idUsuario]` | Detalle | Skeleton correcto | Correcto | Ninguna | B |
| Liderazgo | `/dashboard/proyectos/[id]/liderazgo` | Tarjetas | Skeleton por sección sin etiqueta | a11y parcial | Tarjeta | B |
| Cierre y salida | `/dashboard/projects/[id]/cierre`, `…/salida/preparacion` | Detalle | Skeleton; salida sin etiqueta | a11y parcial | Detalle | B |

### Administración

| Vista o sección | Ruta | Contenido | Estado actual | Problema | Solución propuesta | Prioridad |
|---|---|---|---|---|---|---|
| Panel admin | `/dashboard/admin` | Tarjetas | Skeleton con `status` y etiqueta | Correcto | Tarjeta (consolidar) | A |
| Usuarios | `/dashboard/admin/usuarios` | Tabla | Skeleton con `status` | Correcto | Tabla (consolidar) | A |
| Cuentas pendientes y solicitudes de recuperación | `/dashboard/admin/cuentas-pendientes`, `/dashboard/admin/solicitudes-recuperacion` | Tabla | Skeleton correcto | Correcto | Tabla (consolidar) | M |
| Revisión de publicaciones | `/dashboard/projects/admin/reviews` | Lista | Spinner sin a11y | Spinner | Lista | M |
| Proyectos (activos y cerrados) | `/dashboard/admin/proyectos` | Tablero | Skeleton correcto | Correcto | Ninguna | M |
| Detalle de proyecto | `/dashboard/admin/proyectos/[id]` | Detalle | `aria-busy` sin etiqueta | a11y parcial | Detalle | M |
| Seguridad, sprints, apelaciones, anuncios, métricas, revisión de cierre | `/dashboard/admin/*` | Varios | Skeleton correcto | Correcto | Ninguna | B |
| `ProjectReviewSheet`, `ProjectFeedbackSheet` | Paneles laterales | Detalle | `Skeleton` sin `role` | a11y | Detalle | B |

### Sin skeleton necesario

| Vista | Motivo |
|---|---|
| `/`, `/login`, `/registro`, `/recuperar-contrasena`, `/reset-password` | Formularios sin carga inicial relevante. El `Spinner` de envío es una acción puntual y se conserva; el `Cargando...` de reset-password es el fallback de `Suspense` de `useSearchParams`. |
| `/dashboard/mis-proyectos`, `/dashboard/proyectos/[id]/tablero`, `/dashboard/proyectos/[id]/equipo`, `/dashboard/proyectos/[id]/editar` | Redirecciones. |
| `/dashboard/proyectos/[id]/reportes` | Contenido estático; los spinners solo acompañan la exportación (acción puntual). |

## 3. Decisiones

1. Se amplía `components/ui/skeleton.tsx`; no se crea un sistema nuevo.
2. Las vistas con esqueleto genérico (filas, tarjetas, tabla) pasan a la variante compartida. Las de forma propia (kanban, workspace del líder, tableros admin) conservan su composición y se envuelven en la región accesible común.
3. Las cuatro vistas con `react-loading-skeleton` migran al componente propio y la dependencia se retira de `package.json`.
4. Los spinners de sesión del shell se sustituyen por un skeleton de shell, sin tocar la lógica de las guardas.
5. Los indicadores de acciones puntuales (envíos, exportaciones, botones) se conservan.

## 4. Vistas principales para E2E (T-392)

| Vista | Ruta | Variante |
|---|---|---|
| Inicio | `/dashboard` | Tarjeta |
| Proyectos disponibles (con filtro) | `/dashboard/proyectos` | Tarjeta |
| Mis postulaciones | `/dashboard/mis-postulaciones` | Lista |
| Notificaciones | `/dashboard/notificaciones` | Lista |
| Detalle público de proyecto | `/dashboard/proyectos/[id]` | Detalle |
| Perfil | `/dashboard/perfil` | Detalle |
| Usuarios (admin) | `/dashboard/admin/usuarios` | Tabla |

## 5. Estado tras T-391

Componente: `components/ui/skeleton.tsx` (`Skeleton`, `SkeletonRegion`, `SkeletonList` con `cards`/`rows`/`plain`, `SkeletonCard`, `SkeletonTable`, `SkeletonDetail`) y `components/layout/shell-skeleton.tsx`.
Toda carga inicial se anuncia una sola vez con `SkeletonRegion` (`role="status"`, `aria-busy`, `aria-label` y texto `sr-only`); los bloques son `aria-hidden`.

| Vista o sección | Cambio aplicado |
|---|---|
| Shell estudiante y admin | Spinner → `ShellSkeleton` (barra lateral, barra superior y detalle) |
| Inicio | `react-loading-skeleton` → región + `SkeletonCard` |
| Personas, perfil de persona, chats archivados | `react-loading-skeleton` → `SkeletonList` / región; dependencia retirada |
| Mis postulaciones, postulaciones del proyecto | Texto → `SkeletonList` |
| Notificaciones | Skeleton local → `SkeletonList` |
| Perfil | Spinner → `SkeletonDetail`; estadísticas en `SkeletonCard` mientras llegan (ya no muestran «0 / N/A») |
| Insignias | Texto → región con círculos |
| Editar perfil, postular a rol, Mi proyecto (dueño), `ProjectReviewSheet`, `ProjectFeedbackSheet` | Spinner, texto o barras genéricas → `SkeletonDetail` (y `SkeletonCard` para la validación de postulaciones) |
| Formulario de proyecto | Texto en modal → mismo modal con campos en esqueleto |
| Revisión de publicaciones (admin) | Spinner → región con KPI y filas |
| Mis proyectos | Nueva región para «Proyectos donde participo» mientras carga |
| Comentarios y horas de la tarea, chat dock | Texto → `SkeletonList` `plain` |
| Detalle público, kanban, detalle de tarea, sprint, salida, asistencia, bitácora, miembros, analíticas, burndown, velocidad, liderazgo, documentos y verificación de cierre, detalle admin | Forma propia conservada; se añade `SkeletonRegion` |
| Vistas que ya tenían `role="status"` o `aria-busy` (Mis tareas, Proyectos, admin…) | Contenedor → `SkeletonRegion`, misma etiqueta |

Se conservan a propósito:

- **Calendario:** la rejilla sigue visible y marcada `aria-busy` con su aviso de carga previo (G03, UI-39); solo se añade un esqueleto decorativo en la agenda del mes.
- **Indicadores locales:** botones, exportaciones, calendarios compartidos en la lateral, historial de ajustes de horas, diálogo de compartir calendario, selects y combobox con texto «Cargando…».
- **Valor de las tarjetas KPI de horas** (`hours-kpi-card`): es decorativo dentro de una tarjeta ya rotulada.

## 6. Pruebas E2E (T-392)

Spec: `apps/frontend/e2e/estados-carga.spec.ts` (Playwright, contra la pila aislada `scripts/e2e/isolated-stack.sh`).
La petición principal de cada vista se retiene con `page.route` y se suelta contra el backend real (sin esperas fijas); el contenido esperado se lee antes por la API. Vacío y error se inducen respondiendo en lugar del backend. No escribe datos.

| Vista | Ruta | Skeleton → contenido | Vacío | Error | Otros |
|---|---|---|---|---|---|
| Shell | `/dashboard/*` | Sí (`/usuarios/me` retenido) | — | — | — |
| Inicio | `/dashboard` | Sí | — | Sí (no queda el skeleton) | — |
| Proyectos disponibles | `/dashboard/proyectos` | Sí | Sí | Sí | Filtro por organización |
| Mis postulaciones | `/dashboard/mis-postulaciones` | Sí | Sí | Sí | — |
| Notificaciones | `/dashboard/notificaciones` | Sí | Sí | Sí | — |
| Mis tareas | `/dashboard/mis-tareas` | Sí | Sí | Sí | — |
| Detalle público de proyecto | `/dashboard/proyectos/[id]` | Sí | — | Sí | — |
| Perfil (horas) | `/dashboard/perfil` | Sí | — | Sí (no queda el skeleton) | Sin «0 / N/A» durante la carga |
| Usuarios (admin) | `/dashboard/admin/usuarios` | Sí | Sí | Sí | — |

En cada caso se comprueba: una sola región `role="status"` con el nombre de la vista, `aria-busy="true"`, bloques `aria-hidden` y que la región desaparece al terminar.
«—» indica que la vista no tiene ese estado propio (Inicio y Perfil muestran su contenido aunque falle una petición; el detalle no tiene estado vacío).
