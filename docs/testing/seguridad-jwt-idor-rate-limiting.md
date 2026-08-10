# Seguridad — JWT expirado/manipulado, IDOR y rate limiting

## Metadata

- Fecha: 2026-08-09
- Rama: `feature/barra-de-avance`
- HEAD al momento de escribir esta subtarea: `bf106ea308fc6eaef793438dbcfd05ebdae0436d`
- Alcance (subtarea, 2 SP / 4h): JWT expirado y manipulado; IDOR sobre
  `/proyectos/:id/tareas` y `/tareas/:id`; rate limiting en login y
  recuperación de contraseña; documentación de la cobertura de autorización
  ya existente en `tasks-authorization.service.spec.ts` (59 combinaciones).
- Fuera de alcance de esta subtarea (pertenecen al resto de la HU técnica):
  escenarios de carga con k6, cierre de los puertos 5432/5050 a nivel de
  infraestructura, y el bloqueo T-129 (endurecimiento), que debe estar
  resuelto antes de generar carga real contra el sistema.
- Archivos nuevos:
  - `apps/backend/test/security/jwt-tampering.security.spec.ts`
  - `apps/backend/test/security/idor-tasks.security.spec.ts`
  - `apps/backend/test/security/rate-limiting.security.spec.ts`

## Por qué estas pruebas no bootstrapean Nest ni usan Supertest

El repo ya documentó (comentario en
`test/password-recovery-admin.e2e.spec.ts`) que `Test.createTestingModule()`
+ Supertest cuelga indefinidamente bajo Vitest/esbuild para cualquier
provider cuyo constructor mezcle un parámetro inyectado plano con uno
inyectado vía `forwardRef` (forma real de `NotificationsService`). Por eso
ninguna suite del proyecto levanta la app completa: todas instancian las
piezas reales a mano (servicios, guards) contra un Prisma simulado en
memoria o, cuando aplica, contra Postgres real detrás de un flag de entorno.
Las tres suites de esta subtarea siguen exactamente esa misma convención.

## 1. JWT expirado y manipulado

Archivo: `apps/backend/test/security/jwt-tampering.security.spec.ts` (8 tests).

La verificación se replica con la **misma configuración exacta** que usa
`JwtStrategy` (`src/auth/jwt.strategy.ts`): mismo secreto
(`process.env.JWT_SECRET`, con el mismo fallback de desarrollo que
`AuthModule`) y `ignoreExpiration: false`. Esto prueba la misma decisión
criptográfica que Passport-JWT ejecuta antes de invocar
`JwtStrategy.validate()` en cada request real, sin necesitar bootstrapear
Passport.

| Escenario | Resultado esperado | Estado |
|---|---|---|
| Access token con `expiresIn: '-10s'` (ya vencido) | `TokenExpiredError` | ✅ PASS |
| Token que vence 1ms después de firmarlo, verificado tras cruzar ese instante | `TokenExpiredError` | ✅ PASS |
| Token vigente, no expirado | Verifica y `JwtStrategy.validate()` mapea `{userId, correo}` | ✅ PASS |
| Token firmado con un secreto distinto (forjado por un atacante) | `JsonWebTokenError` (firma inválida) | ✅ PASS |
| Payload alterado después de firmar (escalar `sub` a otro usuario, firma original intacta) | `JsonWebTokenError` | ✅ PASS |
| Token con formato inválido (no son 3 segmentos) | `JsonWebTokenError` | ✅ PASS |
| Token con `alg: "none"` (algorithm confusion clásico) | `JsonWebTokenError` | ✅ PASS |
| Token re-firmado con un secreto "parecido" pero no idéntico | `JsonWebTokenError` | ✅ PASS |

**Nota de alcance:** no se invoca `JwtAuthGuard.canActivate()` end-to-end
(eso ejercitaría la maquinaria interna de `passport`/`passport-jwt`, ya
probada por esas librerías de terceros — mismo criterio ya aplicado en
`test/tasks-queries.controller.spec.ts`, sección "autenticación
(JwtAuthGuard)"). Lo que sí es responsabilidad de esta app —la política de
expiración y el secreto usados— queda probado directamente contra la
configuración real.

## 2. IDOR sobre `/proyectos/:id/tareas` y `/tareas/:id`

Archivo: `apps/backend/test/security/idor-tasks.security.spec.ts` (8 tests).

El único controller de tareas del backend usa rutas anidadas
(`@Controller('proyectos/:projectId/tareas')`, ver
`src/tasks/tasks.controller.ts`): no existe una ruta plana `/tareas/:id`. Las
pruebas cubren por tanto el listado (`GET /proyectos/:id/tareas`) y el
detalle/edición de una tarea puntual (`GET|PATCH|DELETE
/proyectos/:id/tareas/:taskId`, la forma real de "`/tareas/:id`" en este
backend).

El camino de **lectura** (`findAll`/`findOne`) ya tenía cobertura exhaustiva
de aislamiento entre proyectos en `test/tasks-queries-isolation.spec.ts`
(10 tests: 404 vs 403 sin fuga de datos, mismo comportamiento observable
para tarea inexistente vs. tarea de otro proyecto, etc.). Esta subtarea
añade el ángulo de seguridad explícito (framing OWASP A01:2021 – Broken
Access Control) y, sobre todo, el camino de **escritura**, que no estaba
cubierto por esa suite:

| Endpoint / operación | Escenario de ataque | Resultado esperado | Estado |
|---|---|---|---|
| `GET /proyectos/:id/tareas` | Usuario sin participación intenta listar | 403, `tarea.findMany` nunca se invoca | ✅ PASS |
| `GET /proyectos/:id/tareas` | Enumeración de `projectId` 1..5 por un atacante sin acceso a ninguno | 403/404 en todos los casos, sin `findMany` | ✅ PASS |
| `PATCH /proyectos/:id/tareas/:taskId/estado` | Usuario externo cambia estado de tarea de otro proyecto | 403, `tarea.update` nunca se invoca, estado no cambia | ✅ PASS |
| `PATCH .../estado` | `taskId` real pero bajo el `projectId` equivocado (URL manipulada) | 404, sin fuga del título real en el mensaje, sin escritura | ✅ PASS |
| `PATCH .../estado` | Asignado activo de OTRO proyecto prueba su "privilegio" en un proyecto donde no participa | 403, sin escritura | ✅ PASS |
| `PATCH .../estado` | Camino positivo: líder real sobre su propia tarea | 200, `tarea.update` se invoca 1 vez | ✅ PASS (control) |
| `DELETE /proyectos/:id/tareas/:taskId` | Participante activo (no líder) intenta eliminar | 403, sin escritura, `eliminadoEn` sigue `null` | ✅ PASS |
| `DELETE .../:taskId` | `taskId` real bajo `projectId` de otro proyecto (líder legítimo de ESE otro proyecto) | 404, sin fuga del título, sin escritura | ✅ PASS |

Todas las aserciones de "sin escritura" verifican explícitamente que
`prisma.tarea.update` **no fue invocado** y que el estado mutable del
objeto en memoria no cambió — no solo que la promesa rechazó, sino que el
intento de IDOR no dejó ningún efecto secundario.

La matriz interna de reglas de negocio (quién es líder/participante/
asignado y qué puede hacer cada uno) ya está probada exhaustivamente por
`tasks-authorization.service.spec.ts` (ver sección 4); el objetivo de esta
suite es la prueba de ataque de punta a punta contra las tres capas reales
(`TasksService` + `TasksAuthorizationService` + `TasksContextService`), no
repetir esa matriz.

## 3. Rate limiting en login y recuperación de contraseña

Archivo: `apps/backend/test/security/rate-limiting.security.spec.ts` (4 tests).

El backend **no** define un `ThrottlerGuard` por ruta: aplica un único
`ThrottlerGuard` global (`APP_GUARD` en `src/app.module.ts`) con tres
buckets, a **todas** las rutas por igual, incluidas `POST /auth/login` y
`POST /auth/forgot-password`:

| Bucket | Ventana | Límite |
|---|---|---|
| `short` | 1 s | 10 solicitudes |
| `medium` | 10 s | 50 solicitudes |
| `long` | 60 s | 200 solicitudes |

Las pruebas instancian el `ThrottlerGuard` real (mismo paquete
`@nestjs/throttler` que usa `AppModule`) con exactamente esta configuración
y un `ThrottlerStorageService` en memoria, y ejercitan `canActivate()`
repetidamente contra un `ExecutionContext` sintético que apunta a
`AuthController.login`/`AuthController.forgotPassword`.

| Escenario | Resultado esperado | Estado |
|---|---|---|
| 10 solicitudes/segundo a `/auth/login` desde una IP | Las 10 pasan | ✅ PASS |
| Solicitud 11 en el mismo segundo | `ThrottlerException` (429) | ✅ PASS |
| Mismo patrón (10 OK + 11ª bloqueada) contra `/auth/forgot-password` | 429 en la 11ª | ✅ PASS |
| Misma IP, agotó el límite de `login`, prueba `forgot-password` a continuación | No bloqueado (contadores separados por controller+handler) | ✅ PASS |
| Dos IPs distintas, una agota su límite en `login` | La otra IP no se ve afectada (sin bloqueo cruzado) | ✅ PASS |

**Observación para el Plan Maestro de Pruebas (no es un defecto de esta
subtarea, es un hallazgo a registrar):** el límite vigente es genérico
(10 req/s por IP, compartido por toda la API) y no es una política de
fuerza bruta dedicada a `/auth/login` (p. ej. N intentos fallidos por
usuario/IP en varios minutos, con bloqueo progresivo). Un atacante
distribuido en varias IPs, o que respeta el ritmo de 10 req/s, no lo
activa. Se recomienda evaluar un `@Throttle` específico y más estricto
sobre `AuthController.login`/`forgotPassword` en una iteración futura;
queda fuera del alcance de 4h de esta subtarea, que es probar y documentar
el control **ya existente**, no diseñar uno nuevo.

## 4. Cobertura de autorización ya existente (`tasks-authorization.service.spec.ts`)

Archivo: `apps/backend/test/tasks-authorization.service.spec.ts`.
Verificado con `npx vitest run test/tasks-authorization.service.spec.ts
--reporter=verbose`: **59 tests, 59 passed** — coincide exactamente con lo
declarado en la HU.

Desglose por método de `TasksAuthorizationService` (cada uno cubre la
combinación rol × acción × caso borde relevante):

| Método (acción) | # tests | Roles/casos cubiertos |
|---|---:|---|
| `assertCanCreateTask` | 4 | líder permite; no-líder rechaza; proyecto inexistente (404); traslado de cliente transaccional |
| `assertCanEditTask` | 7 | líder permite; participante activo rechaza; asignado activo rechaza; creador rechaza; tarea inexistente (404); tarea de otro proyecto (404); tarea eliminada (404) |
| `assertCanAssignTask` | 3 | líder permite; asignado activo rechaza; participante rechaza |
| `assertCanUnassignTask` | 3 | líder permite; asignado activo rechaza; participante rechaza |
| `assertCanDeleteTask` | 3 | líder permite; creador rechaza; asignado activo rechaza |
| `assertCanChangeTaskState` | 11 | líder permite (sin consultar asignación); asignado activo permite; usuario distinto del asignado rechaza; sin asignación activa rechaza; no reutiliza asignación cerrada; creador rechaza; participante no asignado rechaza (sin consultar participación); tarea inexistente (404); tarea eliminada (404); re-consulta sin caché; revocación inmediata entre llamadas |
| `assertCanListProjectTasks` | 5 | líder permite; participante activo permite; sin participación rechaza; participación no activa rechaza; traslado de cliente transaccional |
| `assertCanReadTask` | 7 | líder permite; participante activo permite; asignado sin participación activa rechaza; usuario externo rechaza; tarea de otro proyecto → 404 sin evaluar participación; tarea eliminada → 404; orden de validación (tarea antes que participación) |
| `assertCanCommentTask` | 5 | líder permite; participante activo permite; asignado sin participación rechaza; usuario externo rechaza; tarea eliminada rechaza |
| `Tarea.creadaPor no concede autorización adicional` | 8 | el creador (sin ser líder/participante/asignado) es rechazado en las 7 acciones (editar, asignar, desasignar, eliminar, cambiar estado, leer, comentar) + invariante de que `creadaPor` se conserva sin influir en la decisión |
| Traslado del cliente transaccional (`tx`) | 3 | `assertCanDeleteTask`, `assertCanChangeTaskState`, `assertCanReadTask` propagan el mismo `tx` a todas las consultas de contexto |
| **Total** | **59** | |

Este archivo no fue modificado por esta subtarea: se documenta tal cual
existía, y se agregó cobertura de **integración/seguridad** complementaria
en `test/security/idor-tasks.security.spec.ts` (sección 2) para el camino
de escritura completo (`TasksService` real, no solo la política aislada de
`TasksAuthorizationService`).

## 5. Cómo ejecutar

```bash
cd apps/backend

# Solo las suites de seguridad de esta subtarea
npx vitest run test/security --reporter=verbose

# Cobertura de autorización ya existente (para reproducir el conteo de 59)
npx vitest run test/tasks-authorization.service.spec.ts --reporter=verbose

# Suite completa del backend (regresión)
npx vitest run
```

Resultado verificado en esta subtarea: suite completa del backend —
**63 archivos, 1253 tests pasados, 14 skipped** (los `skipped` son las
suites de integración contra Postgres real, gateadas por
`INTEGRATION_DATABASE_URL`/`RUN_REAL_DB_TESTS`, que no aplican sin una base
de datos disponible en este entorno) — **0 fallos**.

## 6. Limitaciones de esta subtarea

- No se probó `JwtAuthGuard`/`ThrottlerGuard` como parte de una petición
  HTTP real de extremo a extremo (el repo no tiene Supertest instalado ni
  usa `Test.createTestingModule()` por el cuelgue ya documentado). Las
  pruebas replican con precisión la configuración real de cada pieza
  (mismo secreto/expiración para JWT, mismos buckets/límites para el
  throttler) e invocan el código real de `jsonwebtoken`/`@nestjs/throttler`,
  pero no la integración completa de Express + Passport + Nest.
- El rate limiting probado es el guard global ya configurado; no se
  implementó ni se probó una política de throttling específica de
  autenticación (ver observación en la sección 3).
- El cierre de los puertos 5432/5050 y los escenarios de carga con k6 son
  responsabilidad de otras subtareas de esta misma HU técnica.
