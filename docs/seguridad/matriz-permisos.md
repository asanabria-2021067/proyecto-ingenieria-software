# Matriz de permisos por rol (T-285 / HU-175)

Auditoría de endpoints del backend (`apps/backend/src`) y pantallas del dashboard
(`apps/frontend/app/dashboard`) contra los roles de la aplicación, para cerrar el control de acceso
pendiente de **OWASP A01 (Broken Access Control)**.

- **Fecha de la auditoría:** 2026-10-06
- **Rama:** `feature/permisos-por-rol`
- **Alcance:** todos los controladores HTTP del backend y todas las páginas bajo `/dashboard`.
  Los gateways WebSocket (`chat.gateway.ts`, `notifications.gateway.ts`) quedan fuera: su
  handshake ya está cubierto por C025 (`ws-auth.service.ts`, ver `docs/security/owasp-top10-2025.md`).
- **Estado:** refleja el código **antes** de T-286. La sección 6 indica qué cambia con T-286 y
  qué queda para T-287.

---

## 1. Roles disponibles

### 1.1 Cómo están modelados hoy

La aplicación tiene **dos tipos de "rol" distintos**, y la matriz los usa de forma diferente:

| Tipo | Dónde vive | Valores | Quién lo decide |
| --- | --- | --- | --- |
| **Rol de acceso (global)** | tabla `rol_acceso` (`RolAcceso.nombrePerfil`), asignado vía `usuario_rol_acceso` | `estudiante`, `lider_asociacion`, `mentor`, `coordinador_academico`, `administrador` | Seed / administración. **El registro (`AuthService.register`) no asigna ningún rol de acceso.** |
| **Rol en el proyecto** | `Proyecto.creadoPor` (líder actual) y `ParticipacionProyecto` (participante activo/histórico) | líder actual, participante activo, participante histórico, exlíder, externo | `ProjectPolicyService` (escritura) y `ProjectReadPolicyService` (lectura), siempre contra BD. |

Consecuencias que condicionan T-286:

- El JWT **no lleva roles**: `JwtStrategy.validate` devuelve solo `{ userId, correo }`. Hoy cada
  service consulta en BD si el actor es `administrador` (convención "admin validado en BD").
- **"Líder de proyecto" no es un rol global**: es el `creadoPor` de *ese* proyecto. El rol de acceso
  `lider_asociacion` existe, pero solo lo usa el feed social (`social-feed.service.ts`) y el detalle
  de usuario del panel admin; **no otorga ni restringe ningún endpoint**. Por eso la autorización
  "solo el líder" no se puede expresar con `@Roles(...)`: se mantiene en `ProjectWriteGuard` +
  `ProjectPolicyService.assertWriteTx` (familias con actor `LIDER`) y en los checks `requireOwner`.
- **`mentor` y `coordinador_academico` no tienen funcionalidad exclusiva** en el código actual (solo
  aparecen en `AdminService.getUsuarioDetalle` para mostrar su actividad). A efectos de permisos se
  comportan igual que un estudiante.
- Como los usuarios registrados no tienen rol de acceso, **un `@Roles('estudiante')` dejaría fuera a
  todos los usuarios reales**. El único rol global que hoy discrimina permisos es `administrador`.

### 1.2 Significado de cada columna

| Columna | Qué representa en esta matriz |
| --- | --- |
| **Estudiante** | Usuario autenticado sin rol `administrador` que **no** es el líder del proyecto en cuestión. Puede ser participante activo, postulante o externo; cuando eso importa, la celda lleva ⚠️. |
| **Líder** | Líder actual del proyecto en cuestión (`Proyecto.creadoPor`). Fuera de un proyecto concreto es un estudiante más. |
| **Mentor** | Rol de acceso `mentor`. Hoy sin permisos propios: mismo trato que Estudiante. |
| **Coordinador** | Rol de acceso `coordinador_academico`. Hoy sin permisos propios: mismo trato que Estudiante. |
| **Administración** | Rol de acceso `administrador`, validado en BD. No participa en proyectos (el frontend lo saca del shell de estudiante); supervisa, revisa publicaciones y cierres, y gestiona usuarios. |

### 1.3 Notación

- ✅ permitido
- ❌ no permitido (el backend responde 403, o 404 cuando el recurso no debe revelarse)
- ⚠️ permitido solo con validación adicional (pertenencia al proyecto, propiedad del recurso,
  estado del proyecto/Sprint). La condición se indica en la columna *Protección actual*.

Abreviaturas de *Protección actual*:

| Abreviatura | Significado |
| --- | --- |
| `Público` | Sin guard. |
| `JWT` | `JwtAuthGuard` (solo autenticación: token `access` válido y usuario `ACTIVO`). |
| `OptJWT` | `OptionalJwtAuthGuard` (personaliza si hay sesión, nunca bloquea). |
| `PWG` | `ProjectWriteGuard` + `@ProjectWrite`: valida existencia y **estado** del proyecto y del Sprint ambiente. **No valida el actor.** |
| `W:FAMILIA→ACTOR` | `ProjectPolicyService.assertWriteTx` en el service, tras el lock: valida el actor de la familia (`LIDER`, `ADMIN`, `PARTICIPANTE_ACTIVO`, `LIDER_O_PARTICIPANTE_ACTIVO`, `ACTOR_EXISTENTE` = regla específica del service). |
| `R:scope` | `ProjectReadPolicyService.assertRead` con ese scope (perfiles líder / admin / participante activo / histórico / exlíder / externo). |
| `S:admin` | Check `administrador` en BD dentro del service (`requireAdmin`, `assertAdminTx`, `isAdmin`). |
| `S:owner` | Check `creadoPor === actor` en el service (`requireOwner`, `assertLeader`). |
| `S:self` | La consulta está acotada al usuario autenticado (`userId` del token). |

---

## 2. Matriz de endpoints

Todas las rutas llevan el prefijo global del backend. "Acción requerida" usa `—` cuando la
protección actual ya es correcta.

### 2.1 Autenticación, salud y catálogos

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/` | Health check | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` | — |
| POST | `/auth/login` | Iniciar sesión | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` + throttle | — |
| POST | `/auth/register` | Registro | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` + throttle | — |
| POST | `/auth/forgot-password` | Solicitar recuperación | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` + throttle | — |
| POST | `/auth/reset-password` | Restablecer contraseña con enlace | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` + throttle, token de un solo uso | — |
| POST | `/auth/refresh` | Rotar tokens | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` (cookie refresh) + throttle | — |
| POST | `/auth/logout` | Cerrar sesión | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` (revoca la cookie presente) | — |
| GET | `/catalogs`, `/carreras`, `/habilidades`, `/intereses`, `/cualidades`, `/organizaciones` | Leer catálogos | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` | — |
| POST | `/habilidades`, `/intereses`, `/cualidades` | Alta idempotente de ítem de catálogo desde el editor de perfil | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` | — (diseño intencional: el editor de perfil permite proponer ítems nuevos; si ya existe devuelve el existente) |
| GET | `/validaciones` | Stub sin implementar | ❌ | ❌ | ❌ | ❌ | ✅ | **`Público`** | **T-286** (H-02) |
| POST | `/validaciones` | Stub sin implementar | ❌ | ❌ | ❌ | ❌ | ✅ | **`Público`** | **T-286** (H-02) |

### 2.2 Usuario autenticado, notificaciones, social, búsqueda y chat global

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/usuarios/me`, `/usuarios/me/perfil`, `/usuarios/me/perfil/bootstrap` | Leer el propio usuario/perfil | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| PATCH | `/usuarios/me/perfil` | Editar el propio perfil | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| PUT | `/usuarios/me/habilidades`, `/usuarios/me/intereses`, `/usuarios/me/cualidades`, `/usuarios/me/experiencias` | Reemplazar datos del propio perfil | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| POST | `/usuarios/me/experiencias` | Agregar experiencia propia | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| GET | `/usuarios/me/dashboard`, `/usuarios/me/horas`, `/usuarios/me/tareas` | Resúmenes propios | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| GET | `/usuarios/me/eventos` | Eventos propios en rango | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` (proyectos del usuario) | — |
| GET | `/notificaciones`, `/notificaciones/mias/no-leidas`, `/notificaciones/mias/conteo-no-leidas` | Leer notificaciones propias | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| PATCH | `/notificaciones/leer-todas`, `/notificaciones/:id/leer` | Marcar como leídas | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` (403 si la notificación es de otro) | — |
| POST/PATCH/DELETE | `/social/amistades…`, `/social/seguimientos…` | Gestionar amistades y seguimientos propios | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| GET | `/social/amistades…`, `/social/seguimientos/…`, `/social/usuarios/buscar`, `/social/usuarios/:id`, `/social/feed` | Leer red social / perfil público | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` (excluye administradores de búsquedas; feed vacío para admin) | — |
| GET | `/busqueda` | Búsqueda global | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| GET | `/chats`, `/chats/archivados` | Conversaciones propias | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |

### 2.3 Proyectos

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/proyectos` | Explorar proyectos publicados | ✅ | ✅ | ✅ | ✅ | ✅ | `OptJWT` | — |
| GET | `/proyectos/destacados` | Proyectos destacados | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` | — |
| GET | `/proyectos/:id` | Detalle público (solo estados con detalle público) | ✅ | ✅ | ✅ | ✅ | ✅ | `Público` (filtra por estado) | — |
| GET | `/proyectos/mine`, `/proyectos/mis-proyectos`, `/proyectos/contributor` | Proyectos propios / en los que participa | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| GET | `/proyectos/:id/admin` | Vista administrativa del proyecto | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `R:resumen` + `S:admin` | **T-286** (H-01) |
| GET | `/proyectos/:id/owner` | Vista del dueño (editor) | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `R:resumen` + `S:owner` | — |
| GET | `/proyectos/:id/avance` | Avance del proyecto | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ según `R:resumen` | `JWT` + `R:resumen` + check en service | — |
| POST | `/proyectos` | Crear proyecto (el creador queda como líder) | ✅ | ✅ | ✅ | ✅ | ⚠️ ver H-06 | `JWT` | Decisión de producto (H-06) |
| PUT/PATCH | `/proyectos/:id` | Editar proyecto | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:PROYECTO_EDICION→LIDER` | — |
| PATCH | `/proyectos/:id/estado` | Cambiar estado (B→P, P→E) | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:PROYECTO_EDICION→LIDER` | — |
| POST | `/proyectos/:id/enviar-revision`, `/proyectos/:id/reenviar` | Enviar/reenviar a revisión de publicación | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:PUBLICACION_ENVIO→LIDER` | — |
| POST | `/proyectos/:id/hitos`, `/proyectos/:id/hitos/:idHito/tareas` | Crear hito / asignarle tareas | ⚠️ participante activo | ✅ | ⚠️ participante activo | ⚠️ participante activo | ❌ | `JWT` + `PWG` + `W:HITO_CREATE→LIDER_O_PARTICIPANTE_ACTIVO` | — |
| DELETE | `/proyectos/:id` | Eliminar proyecto (B/O) | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `S:owner` + `W:PROYECTO_EDICION→LIDER` | — |
| POST/DELETE | `/proyectos/:id/guardar` | Guardar / quitar de guardados | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| GET | `/proyectos/:id/postulaciones` | Todas las postulaciones del proyecto | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `R:equipo` + `S:owner` | — |

### 2.4 Postulaciones, roles del proyecto y equipo

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/postulaciones` | Postularse a un rol | ✅ | ⚠️ (no a su propio proyecto) | ✅ | ✅ | ⚠️ ver H-06 | `JWT` + `PWG` + `W:POSTULACION→ACTOR_EXISTENTE` (elegibilidad, cupo, duplicado) | Decisión de producto (H-06) |
| GET | `/postulaciones` | Postulaciones propias + las de proyectos que lidera | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` (nunca listado global) | — |
| GET | `/postulaciones/mis-postulaciones` | Postulaciones propias | ✅ | ✅ | ✅ | ✅ | ✅ | `JWT` + `S:self` | — |
| GET | `/postulaciones/:id` | Detalle de postulación | ⚠️ solo la propia | ✅ | ⚠️ solo la propia | ⚠️ solo la propia | ❌ | `JWT` + propia o `R:equipo` del líder | — |
| PATCH | `/postulaciones/:id/estado` | Aceptar/rechazar postulación | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `S:owner` + `W:POSTULACION` | — |
| DELETE | `/postulaciones/:id` | Retirar postulación | ⚠️ solo la propia | ⚠️ | ⚠️ solo la propia | ⚠️ solo la propia | ❌ | `JWT` + `PWG` + `W:POSTULACION→ACTOR_EXISTENTE` | — |
| GET | `/proyectos/:projectId/roles` | Listar roles del proyecto | ✅ | ✅ | ✅ | ✅ | ✅ | **`JWT` sin política de lectura** | **T-286** (H-05) |
| POST/PATCH/DELETE | `/proyectos/:projectId/roles[/:roleId]` | CRUD de roles del proyecto | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:ROL_CRUD→LIDER` | — |
| POST | `/proyectos/:projectId/roles/:roleId/participacion` | El líder se da de alta en un rol | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:ROL_ALTA_PARTICIPACION→LIDER` | — |
| DELETE | `/proyectos/:projectId/roles/:roleId/participacion` | Retirarse de un rol propio | ⚠️ participante del rol | ⚠️ | ⚠️ participante del rol | ⚠️ participante del rol | ❌ | `JWT` + `PWG` + `W:ROL_RETIRO→ACTOR_EXISTENTE` | — |
| GET | `/proyectos/:id/equipo` | Equipo del proyecto | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ✅ | `JWT` + `R:equipo` | — |
| GET | `/proyectos/:id/equipo/:idUsuario` | Detalle de un miembro | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `R:equipo` + `S:owner` | — |
| GET | `/proyectos/:id/miembros/resumen` | Resumen de miembros | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `R:equipo` + `S:owner` | — |
| GET | `/proyectos/:id/miembros/postulaciones-pendientes` | Postulaciones pendientes | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `R:equipo` + `S:owner` | — |
| GET | `/proyectos/:id/miembros/solicitudes-salida-pendientes` | Salidas pendientes de revisión | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `R:equipo` + `S:owner` | — |

### 2.5 Tareas, horas, avance, etiquetas y comentarios de tarea

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/proyectos/:projectId/tareas`, `/…/tareas/:taskId` | Listar / ver tareas | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ solo Sprints cerrados | `JWT` + `R:tareas` | — |
| POST/PATCH/DELETE | `/proyectos/:projectId/tareas[/:taskId]`, `PATCH …/:taskId/estado` | Crear/editar/mover/borrar tarea | ⚠️ participante activo con rol compatible | ✅ | ⚠️ ídem | ⚠️ ídem | ❌ | `JWT` + `PWG` + `W:TAREA_WRITE→ACTOR_EXISTENTE` (HU-D4) | — |
| POST/DELETE | `/proyectos/:projectId/tareas/:taskId/asignar` | Asignar / desasignar | ⚠️ mismo rol | ✅ | ⚠️ mismo rol | ⚠️ mismo rol | ❌ | `JWT` + `PWG` + `W:TAREA_ASIGNACION→ACTOR_EXISTENTE` | — |
| POST | `/proyectos/:projectId/tareas/:taskId/asignaciones/:assignmentId/cerrar` | Cerrar tramo de asignación | ⚠️ autor/mismo rol | ✅ | ⚠️ ídem | ⚠️ ídem | ❌ | `JWT` + `PWG` + `W:TAREA_ASIGNACION→ACTOR_EXISTENTE` | — |
| POST/PATCH | `/proyectos/:projectId/tareas/:taskId/asignaciones/:assignmentId/avance[/:id]` | Registrar/editar avance | ⚠️ dueño del tramo | ⚠️ dueño del tramo | ⚠️ ídem | ⚠️ ídem | ❌ | `JWT` + `PWG` + `W:AVANCE→ACTOR_EXISTENTE` | — |
| GET | `/proyectos/:projectId/tareas/:taskId/horas`, `…/horas/resumen` | Ver horas | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ según `R:horas` | `JWT` + `R:horas` | — |
| POST/PATCH/DELETE | `/proyectos/:projectId/tareas/:taskId/horas[/:recordId]` | Registrar/editar/revocar horas | ⚠️ dueño | ⚠️ dueño | ⚠️ dueño | ⚠️ dueño | ❌ | `JWT` + `PWG` + `W:REGISTRO_TIEMPO→ACTOR_EXISTENTE` | — |
| GET | `/proyectos/:projectId/sprints/:sprintId/asignaciones/:assignmentId/ajuste-horas` | Historial de ajustes | ⚠️ según `R:horas` | ✅ | ⚠️ | ⚠️ | ⚠️ | `JWT` + `R:horas` | — |
| POST/DELETE | `/proyectos/:projectId/sprints/:sprintId/asignaciones/:assignmentId/ajuste-horas` | Ajustar / revertir horas | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:AJUSTE_HORA→LIDER` | — |
| GET | `/proyectos/:projectId/etiquetas` | Listar etiquetas | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ | `JWT` + check de acceso en service | — |
| POST/PATCH/DELETE | `/proyectos/:projectId/etiquetas[/:labelId]` | CRUD de etiquetas | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:ETIQUETA_CRUD→LIDER` | — |
| PUT/DELETE | `/proyectos/:projectId/tareas/:taskId/etiquetas/:labelId` | Vincular/desvincular etiqueta | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:ETIQUETA_TAREA→LIDER` | — |
| GET | `/proyectos/:projectId/tareas/:taskId/comentarios` | Leer comentarios de tarea | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ | `JWT` + `R:tareas` | — |
| POST/PATCH/DELETE | `/proyectos/:projectId/tareas/:taskId/comentarios[/:commentId]` | Comentar / editar / borrar | ⚠️ participante activo; autor para editar/borrar | ✅ (autor para editar/borrar) | ⚠️ ídem | ⚠️ ídem | ❌ | `JWT` + `PWG` + `W:COMENTARIO_TAREA→ACTOR_EXISTENTE` | — |

### 2.6 Sprints, eventos y actividades

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/proyectos/:projectId/sprints` | Iniciar Sprint | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:SPRINT_START→LIDER` | — |
| POST | `/proyectos/:projectId/sprints/:sprintId/finalizar` | Finalizar Sprint | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:SPRINT_FINALIZE→LIDER` | — |
| POST | `/proyectos/:projectId/sprints/:sprintId/cerrar` | Cerrar Sprint | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:SPRINT_CLOSE→LIDER` | — |
| POST | `/proyectos/:projectId/sprints/:sprintId/instantanea` | Regenerar instantánea del día | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `SprintsAuthorizationService.assertCanManageSprintSnapshot` | — |
| GET | `/proyectos/:projectId/sprints/:sprintId/resumen-cierre[/miembros/:userId]` | Resumen de cierre de Sprint | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `R:sprints` + check de líder en service | — |
| GET | `/proyectos/:projectId/sprints`, `/…/:sprintId`, `/…/analytics`, `/…/:sprintId/analytics`, `/…/:sprintId/burndown` | Leer Sprints y analítica | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ solo cerrados | `JWT` + `R:sprints` | — |
| GET | `/proyectos/:projectId/eventos` | Eventos del proyecto | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ❌ | `JWT` + check de acceso en service | — |
| POST/PATCH/DELETE | `/proyectos/:projectId/eventos[/:eventId]` | Gestionar eventos | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `S:owner` | — |
| GET | `/proyectos/:projectId/actividades[/:actividadId]` | Ver actividades / asistencia | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ | `JWT` + `R:asistencia` | — |
| POST | `/proyectos/:projectId/actividades` | Crear actividad | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:ACTIVIDAD_ASISTENCIA→LIDER` | — |
| PATCH | `/proyectos/:projectId/actividades/:actividadId/asistencia/:usuarioId` | Marcar asistencia | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:ACTIVIDAD_ASISTENCIA→LIDER` | — |

### 2.7 Comunicación del proyecto (chat, comentarios, mensajes de revisión)

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET/POST | `/proyectos/:projectId/conversaciones` | Listar / crear conversación | ⚠️ participante activo | ✅ | ⚠️ participante activo | ⚠️ participante activo | ❌ | `JWT` + `assertProjectMember` en service | — |
| GET/POST | `/proyectos/:projectId/conversaciones/:conversationId/mensajes` | Leer / enviar mensajes | ⚠️ miembro de la conversación | ⚠️ ídem | ⚠️ ídem | ⚠️ ídem | ❌ | `JWT` + membresía de la conversación | — |
| PATCH/DELETE/POST | `/proyectos/:projectId/conversaciones/:conversationId[/leido]` | Preferencias, borrar, marcar leído | ⚠️ miembro de la conversación | ⚠️ ídem | ⚠️ ídem | ⚠️ ídem | ❌ | `JWT` + membresía de la conversación | — |
| GET | `/comentarios/proyecto/:idProyecto`, `/comentarios/hito/:idHito` | Leer comentarios de proyecto/hito | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ | `JWT` + `R:*` en service | — |
| POST | `/comentarios` | Comentar proyecto/hito | ⚠️ participante activo (P/E) | ✅ (B/R/O/P/E) | ⚠️ ídem | ⚠️ ídem | ❌ | `JWT` + `PWG` + `W:COMENTARIO_PROYECTO_HITO→ACTOR_EXISTENTE` | — |
| PATCH/DELETE | `/comentarios/:idComentario` | Editar / borrar comentario | ⚠️ autor | ⚠️ autor | ⚠️ autor | ⚠️ autor | ❌ | `JWT` + `PWG` + autoría en service | — |
| GET | `/mensajes-revision/proyectos/:idProyecto` | Canal de revisión de publicación | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + `assertChannelBAccess` (líder o admin) | — |
| POST | `/mensajes-revision/proyectos/:idProyecto` | Escribir en el canal | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + `PWG` + líder o admin en service | — |
| PATCH | `/mensajes-revision/proyectos/:idProyecto/marcar-leidos` | Acuse personal | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + líder o admin en service | — |

### 2.8 Salidas, liderazgo, bitácora, exportación e histórico

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/proyectos/:projectId/solicitudes-salida` | Solicitar salida del proyecto | ⚠️ participante activo | ❌ | ⚠️ participante activo | ⚠️ participante activo | ❌ | `JWT` + `PWG` + `W:SALIDA` + `ExitRequestsAuthorizationService` | — |
| POST | `/proyectos/:projectId/solicitudes-salida/:idSolicitud/aprobar`, `…/rechazar` | Resolver salida | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:SALIDA` + check de líder | — |
| GET | `/proyectos/:projectId/salida/estado`, `/…/salida/preparacion` | Estado / preparación de la salida propia | ⚠️ participante activo | ❌ | ⚠️ participante activo | ⚠️ participante activo | ❌ | `JWT` + participación activa en service | — |
| POST | `/proyectos/:projectId/salida/preparacion/continuar`, `…/cancelar` | Avanzar / cancelar preparación de salida | ⚠️ solicitante | ❌ | ⚠️ solicitante | ⚠️ solicitante | ❌ | `JWT` + `PWG` + `W:SALIDA` | — |
| GET | `/proyectos/:projectId/liderazgo/contexto`, `…/candidatos` | Contexto de traspaso de liderazgo | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + `R:liderazgo` | — |
| GET | `/proyectos/:projectId/liderazgo/historial`, `…/apelaciones` | Historial y apelaciones | ⚠️ exlíder: solo lo propio | ✅ | ⚠️ ídem | ⚠️ ídem | ✅ | `JWT` + `R:liderazgo` | — |
| POST | `/proyectos/:projectId/liderazgo/apelaciones` | Crear apelación de liderazgo | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:LIDERAZGO` + líder actual | — |
| POST | `/proyectos/:projectId/liderazgo/apelaciones/:appealId/cancelar` | Cancelar apelación | ❌ | ⚠️ autor | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:LIDERAZGO` + autoría | — |
| GET | `/proyectos/:projectId/bitacora` | Bitácora del proyecto | ⚠️ participante activo (sin eventos sensibles) | ✅ | ⚠️ ídem | ⚠️ ídem | ✅ | `JWT` + `R:bitacora` | — |
| GET | `/proyectos/:projectId/exportar/csv`, `…/pdf` | Exportar miembros/horas | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + `R:exportacion` | — |
| GET | `/proyectos/:projectId/historico` | Vista histórica | ⚠️ según `R:historico` | ✅ | ⚠️ | ⚠️ | ✅ | `JWT` + `R:historico` | — |
| GET | `/proyectos/:projectId/sprints/:sprintId/contribuciones-eliminadas` | Contribuciones eliminadas | ⚠️ según `R:*` | ✅ | ⚠️ | ⚠️ | ✅ | `JWT` + `R:*` | — |

### 2.9 Cierre del proyecto

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/proyectos/:projectId/cierre/preparacion` | Preparar cierre | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:CIERRE_PREPARACION→LIDER` | — |
| POST | `/proyectos/:projectId/cierre/informe-automatico` | Generar informe PDF | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:CIERRE_PREPARACION→LIDER` | — |
| POST | `/proyectos/:projectId/solicitar-cierre` | Enviar solicitud de cierre | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:CIERRE_ENVIO→LIDER` | — |
| POST | `/proyectos/:projectId/cierre/reenviar` | Reenvío documental | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:CIERRE_ENVIO→LIDER` | — |
| GET | `/proyectos/:projectId/cierre/readiness` | Checklist de cierre | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + `S:owner` o `S:admin` | — |
| GET | `/proyectos/:projectId/cierre/revisiones[/:numero]` | Revisiones de cierre | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + `R:documentos` | — |
| POST | `/proyectos/:projectId/cierre/documentos`, `…/documentos/firma` | Subir / reservar evidencia | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:CIERRE_EVIDENCIAS→LIDER` | — |
| DELETE | `/proyectos/:projectId/cierre/documentos/:documentId` | Quitar evidencia | ❌ | ✅ | ❌ | ❌ | ❌ | `JWT` + `PWG` + `W:CIERRE_EVIDENCIAS→LIDER` | — |
| GET | `/proyectos/:projectId/cierre/documentos/:documentId/url`, `…/contenido` | Leer evidencia | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + `R:documentos` | — |
| POST | `/proyectos/:projectId/aprobar-cierre` | Aprobar cierre | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `PWG` + `W:CIERRE_VEREDICTO→ADMIN` | **T-286** (H-01) |
| POST | `/proyectos/:projectId/rechazar-cierre` | Devolver a ejecución | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `PWG` + `W:CIERRE_VEREDICTO→ADMIN` | **T-286** (H-01) |
| POST | `/proyectos/:projectId/cierre/correccion-documental` | Pedir corrección documental | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `PWG` + `W:CIERRE_VEREDICTO→ADMIN` | **T-286** (H-01) |

### 2.10 Administración

| Método | Endpoint | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/admin/estadisticas` | Estadísticas del panel | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| GET | `/admin/metricas` | Tendencias de uso | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| GET | `/admin/usuarios`, `/admin/usuarios/:id` | Listar / ver usuarios | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| PATCH | `/admin/usuarios/:id/estado` | Activar / bloquear usuario | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` (+ no a sí mismo ni a otro admin) | **T-286** (H-01) |
| GET | `/admin/password-reset-requests` | Solicitudes de recuperación | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| POST | `/admin/password-reset-requests/:id/generate-link` | Generar enlace de recuperación | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| GET | `/admin/proyectos`, `/admin/proyectos/:projectId` | Bandeja y detalle de proyectos | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` / `R:resumen` perfil ADMIN | **T-286** (H-01) |
| POST | `/admin/storage/cierre/barrido` | Purga de documentos de cierre | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| GET | `/admin/liderazgo/apelaciones` | Bandeja de apelaciones | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| POST | `/admin/proyectos/:projectId/liderazgo/apelaciones/:appealId/aceptar`, `…/denegar` | Resolver apelación | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `PWG` + `W:LIDERAZGO` + `S:admin` | **T-286** (H-01) |
| POST | `/admin/proyectos/:projectId/liderazgo/cambiar` | Cambiar líder | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `PWG` + `W:LIDERAZGO` + `S:admin` | **T-286** (H-01) |
| GET | `/revisiones/admin/bandeja` | Bandeja de revisión de publicaciones | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `S:admin` | **T-286** (H-01) |
| GET | `/revisiones/proyectos/:idProyecto` | Historial de revisiones del proyecto | ❌ | ✅ | ❌ | ❌ | ✅ | `JWT` + líder o admin en service | — |
| POST | `/revisiones/proyectos/:idProyecto/reclamar` | Reclamar revisión | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `PWG` + `W:PUBLICACION_REVISION→ADMIN` | **T-286** (H-01) |
| POST | `/revisiones/proyectos/:idProyecto/resolver` | Aprobar / observar publicación | ❌ | ❌ | ❌ | ❌ | ✅ | `JWT` + `PWG` + `W:PUBLICACION_REVISION→ADMIN` | **T-286** (H-01) |

---

## 3. Matriz de pantallas (`/dashboard`)

Mecanismos de protección del frontend encontrados:

- `middleware.ts`: sin cookie `access_token` redirige todo `/dashboard/*` a `/login` (solo sesión).
- `app/dashboard/layout.tsx` elige el shell por ruta:
  - `AdminLayout` (rutas `/dashboard/admin/*` y `/dashboard/projects/admin/*`): redirige a
    `/dashboard` a quien no es `administrador` (T-302).
  - `DashboardLayout`: redirige a `/dashboard/admin` a un administrador, salvo las rutas
    `allowAdmin` (`/dashboard/proyectos`, `/dashboard/proyectos/[id]`, `/dashboard/projects/[id]`).
  - `SHARED_ROLE_ROUTES` (`/dashboard/perfil`, `/dashboard/notificaciones`): shell según rol.
  - `NO_SHELL_ROUTES` (`/dashboard/mis-proyectos`, `/dashboard/projects`): **sin shell y sin
    ninguna comprobación de rol**.
- Dentro de un proyecto: `useIsProjectLeader` / `isLeader` + `LeaderOnlyNotice`, evaluados en
  cliente antes de disparar la query.
- El frontend solo distingue `administrador` (`isAdminUser`); no conoce `mentor`,
  `coordinador_academico` ni `lider_asociacion`, coherente con el backend (sección 1.1).

| Pantalla/Ruta | Acción | Estudiante | Líder | Mentor | Coordinador | Administración | Protección actual | Acción requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/dashboard` | Inicio del estudiante | ✅ | ✅ | ✅ | ✅ | ❌ (va a `/dashboard/admin`) | `DashboardLayout` | — |
| `/dashboard/admin` | Panel de administración y tendencias | ❌ | ❌ | ❌ | ❌ | ✅ | `AdminLayout` | — |
| `/dashboard/admin/usuarios` | Gestión de usuarios (bloquear/activar) | ❌ | ❌ | ❌ | ❌ | ✅ | `AdminLayout` | — |
| `/dashboard/admin/solicitudes-recuperacion` | Generar enlaces de recuperación | ❌ | ❌ | ❌ | ❌ | ✅ | `AdminLayout` | — |
| `/dashboard/admin/apelaciones` | Resolver apelaciones de liderazgo | ❌ | ❌ | ❌ | ❌ | ✅ | `AdminLayout` | — |
| `/dashboard/admin/proyectos`, `/dashboard/admin/proyectos/[id]` | Supervisar proyectos | ❌ | ❌ | ❌ | ❌ | ✅ | `AdminLayout` | — |
| `/dashboard/admin/proyectos/[id]/cierre` | Veredicto de cierre (aprobar/devolver/corrección) | ❌ | ❌ | ❌ | ❌ | ✅ | `AdminLayout` | — |
| `/dashboard/projects/admin/reviews` | Revisión de publicaciones (reclamar/resolver) | ❌ | ❌ | ❌ | ❌ | ✅ | `AdminLayout` | — |
| `/dashboard/perfil`, `/dashboard/notificaciones` | Perfil y notificaciones propios | ✅ | ✅ | ✅ | ✅ | ✅ | Shell según rol | — |
| `/dashboard/perfil/editar` | Editar perfil propio | ✅ | ✅ | ✅ | ✅ | ❌ | `DashboardLayout` | — |
| `/dashboard/calendario`, `/dashboard/mis-horas`, `/dashboard/mis-tareas`, `/dashboard/mis-postulaciones`, `/dashboard/chats/archivados` | Vistas personales | ✅ | ✅ | ✅ | ✅ | ❌ | `DashboardLayout` (datos `S:self` en backend) | — |
| `/dashboard/personas`, `/dashboard/personas/[id]` | Red social / perfil público | ✅ | ✅ | ✅ | ✅ | ❌ | `DashboardLayout` | — |
| `/dashboard/proyectos` | Explorar proyectos | ✅ | ✅ | ✅ | ✅ | ✅ | `DashboardLayout allowAdmin` | — |
| `/dashboard/proyectos/[id]` | Detalle público; botón postular | ✅ | ✅ | ✅ | ✅ | ✅ (sin postular) | `DashboardLayout allowAdmin` | — |
| `/dashboard/proyectos/[id]/postular/[rolId]` | Postularse a un rol | ✅ | ⚠️ no a su proyecto | ✅ | ✅ | ❌ | `DashboardLayout`; validación en backend | — |
| `/dashboard/proyectos/[id]/postulaciones` | Aceptar/rechazar postulaciones | ❌ | ✅ | ❌ | ❌ | ❌ | **Ninguna en cliente**: un no líder ve el error genérico del 403 | **T-287** (H-07) |
| `/dashboard/proyectos/[id]/miembros` (+ `/postulaciones`, `/solicitudes-salida`) | Gestión de miembros, postulaciones y salidas | ❌ | ✅ | ❌ | ❌ | ❌ | `LeaderOnlyNotice` | — |
| `/dashboard/proyectos/[id]/equipo/[idUsuario]` | Detalle de miembro | ❌ | ✅ | ❌ | ❌ | ❌ | `LeaderOnlyNotice` | — |
| `/dashboard/proyectos/[id]/liderazgo` | Traspaso / apelaciones de liderazgo | ❌ | ✅ | ❌ | ❌ | ❌ | `LeaderOnlyNotice` | — |
| `/dashboard/proyectos/[id]/bitacora` | Bitácora | ⚠️ participante activo | ✅ | ⚠️ participante activo | ⚠️ participante activo | ❌ | `isLeader \|\| esParticipante` + `LeaderOnlyNotice` | — |
| `/dashboard/proyectos/[id]/reportes` | Exportar CSV/PDF | ❌ | ✅ | ❌ | ❌ | ❌ | `LeaderOnlyNotice` | — |
| `/dashboard/proyectos/[id]/sprints`, `/sprints/[sprintId]` | Gestionar Sprints | ⚠️ solo lectura | ✅ | ⚠️ solo lectura | ⚠️ solo lectura | ❌ | `isLeader` / `puedeOperar` + `LeaderOnlyNotice` | — |
| `/dashboard/proyectos/[id]/sprints/[sprintId]/finalizar` | Finalizar/cerrar Sprint, ajustar horas | ❌ | ✅ | ❌ | ❌ | ❌ | `LeaderOnlyNotice` | — |
| `/dashboard/proyectos/[id]/sprints/analytics`, `/sprints/[sprintId]/analytics`, `/sprints/[sprintId]/informes/burndown`, `/sprints/informes/velocidad` | Analítica de Sprints | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ❌ | Sin chequeo en cliente; backend `R:sprints`; muestra error genérico | — (lectura ya protegida en backend) |
| `/dashboard/proyectos/[id]/editar`, `/equipo`, `/tablero` | Redirecciones legacy | — | — | — | — | — | Redirigen a rutas protegidas | — |
| `/dashboard/projects/mine` | Mis proyectos como líder | ✅ | ✅ | ✅ | ✅ | ❌ | `DashboardLayout` (`S:self`) | — |
| `/dashboard/projects/mine/form` (sin `id`) | Crear proyecto | ✅ | ✅ | ✅ | ✅ | ❌ | `DashboardLayout` | — |
| `/dashboard/projects/mine/form?id=` | Editar proyecto | ❌ | ✅ | ❌ | ❌ | ❌ | **Ninguna en cliente**: depende del 403 de `/proyectos/:id/owner` | **T-287** (H-07) |
| `/dashboard/projects/mine/[id]` | Vista del dueño (editar, enviar a revisión, eliminar) | ❌ | ✅ | ❌ | ❌ | ❌ | **Ninguna en cliente**: depende del 403 de `/proyectos/:id/owner` | **T-287** (H-07) |
| `/dashboard/projects/[id]` | Workspace del proyecto | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ⚠️ solo lectura | `DashboardLayout allowAdmin` + `isLeader` oculta acciones | — |
| `/dashboard/projects/[id]/kanban`, `/kanban/tasks/[taskId]`, `/tareas` | Tablero y tareas | ⚠️ participante | ✅ | ⚠️ participante | ⚠️ participante | ❌ | `isLeader` oculta acciones de líder; backend valida HU-D4 | — |
| `/dashboard/projects/[id]/cierre` | Preparar y enviar cierre | ❌ | ✅ | ❌ | ❌ | ❌ | `isLeader` en `closure-preparation-client` | — |
| `/dashboard/projects/[id]/salida/preparacion` | Preparar salida propia | ⚠️ participante activo | ❌ | ⚠️ participante activo | ⚠️ participante activo | ❌ | Mensaje "No tienes…" ante 403 del backend | — |
| `/dashboard/mis-proyectos`, `/dashboard/projects` | Listados legacy sin shell | ✅ | ✅ | ✅ | ✅ | ❌ | **Solo sesión** (`NO_SHELL_ROUTES`, sin redirección de admin) | **T-287** (H-08) |

Acciones que deben quedar ocultas o deshabilitadas por rol (estado actual):

- **Acciones de líder** (editar proyecto, CRUD de roles/etiquetas, iniciar/finalizar/cerrar Sprint,
  ajustar horas, crear actividad/evento, resolver postulaciones y salidas, preparar cierre):
  ya se ocultan con `isLeader` en workspace, kanban, Sprints y cierre. Faltan las tres pantallas de
  H-07.
- **Postular** y **crear proyecto**: se ocultan al administrador por el shell (`DashboardLayout`),
  pero el backend los permite (H-06).
- **Veredictos de publicación/cierre, gestión de usuarios y apelaciones**: solo existen en
  pantallas `AdminLayout`.

---

## 4. Hallazgos

### H-01 — Endpoints exclusivos de administración sin autorización declarativa por rol

**Endpoints:** todos los marcados **T-286 (H-01)** en la sección 2 (21 rutas en `admin.controller`,
`admin-projects.controller`, `closure-storage-admin.controller`, `leadership-admin.controller`,
`revisiones.controller` [bandeja, reclamar, resolver], `project-closure.controller` [aprobar,
rechazar, corrección documental] y `projects.controller` [`GET :id/admin`]).

**Estado:** en el controlador **solo tienen `JwtAuthGuard`** (y `ProjectWriteGuard`, que no valida
actor). La restricción a administración existe, pero **solo dentro del service** y con cinco
implementaciones distintas del mismo check (`AdminService.requireAdmin`,
`ProjectPolicyService.assertAdminTx`, `ProjectReadPolicyService.isAdmin`,
`NotificationsService.isAdmin`, `RevisionesService._requireAdmin`). Hoy responden **403**
correctamente, pero:

- la autorización no es visible ni verificable en la ruta (un handler nuevo en estos controladores
  queda abierto a cualquier autenticado si olvida llamar al check);
- en `GET /proyectos/:id/admin` y `GET /admin/proyectos/:projectId` el check de admin corre
  **después** de la política de lectura, y en las rutas con `ProjectWriteGuard` un no admin recibe
  primero 404/409 de estado antes que el 403 de rol.

**No existe** ningún `RolesGuard`, `@Roles` ni metadata de roles en el backend.

### H-02 — `/validaciones` expuesto sin autenticación

`ValidationController` (`GET` y `POST /validaciones`) no tiene ningún guard. Hoy el service es un
stub que devuelve `Not implemented yet`, por lo que no expone datos, pero es una ruta pública que
cualquier implementación futura heredaría abierta.

### H-03 — Endpoints que solo usan autenticación (revisados, correctos)

Usan solo `JwtAuthGuard` en el controlador y **están bien** porque el service acota por usuario o
por proyecto: `/usuarios/me/*`, `/notificaciones/*`, `/social/*`, `/busqueda`, `/chats/*`,
`/proyectos/mine|mis-proyectos|contributor`, `/proyectos/:id/guardar`, `/postulaciones` (GET),
`/proyectos/:id/owner`, `/proyectos/:id/postulaciones`, todo `team.controller`, eventos, chat de
proyecto, exportaciones, bitácora, histórico, lecturas de Sprints/tareas/horas/etiquetas/comentarios
(vía `ProjectReadPolicyService`) y `POST /habilidades|intereses|cualidades` (diseño intencional).
Ninguno necesita `RolesGuard`: su regla no depende de un rol global.

### H-04 — Endpoints de escritura con `ProjectWriteGuard`: el guard no valida rol, el service sí

`ProjectWriteGuard` solo valida estado del proyecto y del Sprint. La validación del actor (líder,
participante, admin) la hace `ProjectPolicyService.assertWriteTx` dentro del lock, según la
familia del catálogo, y está presente en **todas** las rutas de escritura revisadas. Se conserva tal
cual. Solo las familias con actor `ADMIN` (`PUBLICACION_REVISION`, `CIERRE_VEREDICTO`) y las rutas
de `leadership-admin.controller` necesitan además `RolesGuard` (ya incluidas en H-01).

### H-05 — `GET /proyectos/:projectId/roles` sin política de lectura

`RolesService.listRoles` solo comprueba que el proyecto exista y no esté eliminado. Cualquier
usuario autenticado puede listar los roles (nombre, descripción, cupos, requisitos) de un proyecto
en `BORRADOR`, `EN_REVISION`, `OBSERVADO` o `CANCELADO` conociendo su id. Es una fuga menor de
autorización a nivel de objeto (no de rol global): para proyectos sin detalle público, solo el líder
(y quien la política de lectura admita) debería verlos.

### H-06 — Administración puede crear proyectos y postularse vía API

`POST /proyectos` y `POST /postulaciones` no excluyen al rol `administrador`. El frontend sí lo
impide (el shell de estudiante redirige al admin y el detalle oculta "Postular"), y el resto del
backend trata al admin como no participante (búsqueda y feed lo excluyen). **Es una inconsistencia
de regla de negocio, no una escalada de privilegios**: el admin ya tiene más permisos que un
estudiante. Requiere decisión de producto antes de bloquearlo, por lo que **no se corrige en
T-286** salvo indicación expresa.

### H-07 — Pantallas de líder sin aviso de "solo líder" en cliente

`/dashboard/proyectos/[id]/postulaciones`, `/dashboard/projects/mine/[id]` y
`/dashboard/projects/mine/form?id=` no comprueban en cliente si el usuario es el líder. El backend
responde 403 (no hay fuga de datos), pero el usuario ve un error genérico en lugar de
`LeaderOnlyNotice`, a diferencia del resto de pantallas de líder.

### H-08 — Rutas legacy sin shell sin comprobación de rol

`/dashboard/mis-proyectos` y `/dashboard/projects` están en `NO_SHELL_ROUTES`: solo las protege el
middleware de sesión y no redirigen al administrador como el resto de pantallas de estudiante. Los
datos que muestran están acotados al usuario en el backend.

### Casos ya correctamente protegidos

- Todo `/dashboard/admin/*` y `/dashboard/projects/admin/*` (`AdminLayout`, T-302).
- Todas las escrituras de proyecto con actor `LIDER` / `PARTICIPANTE_ACTIVO` / `ACTOR_EXISTENTE`
  (sección 2, filas con `W:`), que devuelven 403 desde `ProjectPolicyService`.
- Lecturas por proyecto vía `ProjectReadPolicyService` (matriz §34/§41 con perfiles y scopes).
- Pantallas de líder con `LeaderOnlyNotice` (miembros, liderazgo, bitácora, reportes, Sprints,
  finalizar Sprint, detalle de miembro, cierre).
- Usuarios no `ACTIVO`: `JwtStrategy` los rechaza con 401 en cada request.

---

## 5. Cobertura de los roles `mentor`, `coordinador_academico` y `lider_asociacion`

No hay endpoints ni pantallas exclusivos de estos roles en el código actual, y ninguno restringe
nada. En la matriz se comportan como Estudiante. Si en una HU futura se les da funcionalidad propia
(p. ej. validación de horas por coordinador), el `RolesGuard` de T-286 es el mecanismo para
declararlo (`@Roles('coordinador_academico', 'administrador')`).

---

## 6. Plan de corrección

| Hallazgo | Corrección | Tarea |
| --- | --- | --- |
| H-01 | Crear `RolesGuard` (`common/guards/roles.guard.ts`) y `@Roles(...)` (`common/decorators/roles.decorator.ts`). El guard lee los roles del usuario **desde BD** (`usuario_rol_acceso` → `rol_acceso.nombre_perfil`), porque el JWT no los lleva; sin `@Roles` deja pasar (no-op), y si el rol no coincide lanza `ForbiddenException` (403) con el mensaje existente `'Acceso restringido a administradores'` cuando se exige admin. Aplicar `@Roles('administrador')` + `RolesGuard` justo después de `JwtAuthGuard` en los controladores/rutas de H-01, **sin quitar** `ProjectWriteGuard` ni los checks de los services (defensa en profundidad). | **T-286** |
| H-02 | Proteger `ValidationController` con `JwtAuthGuard` + `RolesGuard` y `@Roles('administrador')` (cerrado por defecto hasta que se implemente). | **T-286** |
| H-03 | Sin cambios: autorización ya acotada por usuario/proyecto en el service. | — |
| H-04 | Sin cambios en `ProjectWriteGuard`/`ProjectPolicyService`; `RolesGuard` se suma solo en rutas de actor `ADMIN` (cubiertas por H-01). | — |
| H-05 | En `RolesService.listRoles`, para quien no sea el líder, aplicar la misma regla del detalle público (solo estados con detalle público) o la política de lectura del proyecto; responder 404 en caso contrario. | **T-286** |
| H-06 | Ninguna hasta decisión de producto (se documenta). | Pendiente de decisión |
| H-07 | Añadir `useIsProjectLeader` + `LeaderOnlyNotice` en las tres pantallas. | **T-287** |
| H-08 | Incluir las rutas legacy en la redirección por rol (o retirarlas). | **T-287** |

Pruebas previstas para T-286: unitarias de `RolesGuard` (rol autorizado pasa, rol no autorizado →
403, sin `@Roles` pasa, usuario sin roles → 403 cuando se exigen) y verificación de que las rutas de
H-01/H-02 declaran `JwtAuthGuard` antes de `RolesGuard` y conservan sus guards previos.
