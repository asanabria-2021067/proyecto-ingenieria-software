# Endurecimiento de produccion — Sprint 6 (T-127, T-128)

## T-128 (IESUC-286) — Cierre de puertos 5432 y 5050

### Hallazgo

`apps/backend/docker-compose.yml` publicaba `postgres` (5432) y `pgadmin` (5050)
con la forma corta de mapeo de puertos (`"HOST:CONTAINER"`), que Docker
publica en `0.0.0.0` por defecto. En la VM de Azure eso deja ambos servicios
alcanzables desde Internet, no solo desde `localhost`.

### Medida aplicada

- `postgres`: `"${DB_PORT:-5432}:5432"` -> `"127.0.0.1:${DB_PORT:-5432}:5432"`.
- `pgadmin`: `"5050:5050"` -> `"127.0.0.1:5050:5050"`, y se movio bajo
  `profiles: [tools]` para que no se levante con `docker compose up -d` ni con
  `docker compose --profile app up -d` (el perfil que usa
  `.github/workflows/deploy.yml`).
- Se agrego la politica `logging` (json-file, `max-size: 10m`, `max-file: 3`)
  a `postgres` y `pgadmin`, que eran los dos servicios sin esa politica en
  `apps/backend/docker-compose.yml`.
- Mismo tratamiento de puerto en `apps/backend/docker-compose.example.yml`
  (unico ejemplo con `postgres`; el ejemplo raiz solo declara `backend`/
  `frontend`, que exponen 3000/3001 y quedan permitidos).
- `apps/backend/test/security-exposed-ports.spec.ts` (nuevo) lee los archivos
  de Compose versionados como texto y falla si algun servicio interno
  (`postgres`, `pgadmin`, `redis`) publica un puerto sin restringir a
  `127.0.0.1`, o si cualquier otro puerto publicado fuera de la allowlist
  (3000, 3001) no esta restringido a loopback. Convierte la regresion en un
  fallo de CI, no solo en una revision manual.
- `README.md` actualizado: `docker compose up -d` ya no dice "solo base de
  datos + pgAdmin" (ahora es solo base de datos; pgAdmin requiere
  `--profile tools`), y se documento el acceso remoto via tunel SSH.

### Redis (6379) - investigacion, sin cambio en el repositorio

`docker-compose.yml` (raiz) no declara bloque `ports` para `redis` desde el
commit `bb23fc2` ("chore: quita puerto expuesto de redis y agrega logging
acotado"), previo a este ticket. El backend se conecta a Redis por el
hostname interno (`REDIS_HOST=redis`) dentro de `uvg-network`, asi que el
mapeo al host nunca hizo falta.

El `0.0.0.0:6379->6379/tcp` que muestra `docker compose ps` en la VM no viene
del repositorio: es un contenedor `uvg-collab-redis` mas viejo que ese
commit y que nunca se recreo (los `up -d` posteriores no tocan un servicio
cuya definicion no cambio en las capas que Compose compara). No hay archivo
de override en la VM que lo explique; ver "Comandos para aplicar en la VM"
para el procedimiento de recreacion.

### Verificacion — desde dentro de la VM

```bash
ss -tlnp | grep -E ':5432|:5050|:6379'
```

Resultado esperado: los tres puertos con `127.0.0.1:5432` / `127.0.0.1:5050`
como direccion local (nunca `0.0.0.0:*` ni `[::]:*`), y sin listener publico
en `:6379` una vez recreado el contenedor de Redis.

`[Completar]`: captura de `ss -tlnp` en la VM tras el despliegue.

### Verificacion — desde fuera de la VM

Estado previo a este ticket (Network Security Group de Azure ya bloqueaba
5432 y 6379, pero como unica capa de control, fuera del repositorio):

```
nc -zv -w 5 158.23.57.118 5432   ->  timed out
nc -zv -w 5 158.23.57.118 6379   ->  timed out
nc -zv -w 5 158.23.57.118 80     ->  succeeded
```

Repetir tras el despliegue (agrega 5050, sin cambios esperados en 5432/6379):

```bash
nc -zv -w3 158.23.57.118 5432
nc -zv -w3 158.23.57.118 5050
nc -zv -w3 158.23.57.118 6379
```

Resultado esperado: conexion rechazada/timeout en los tres (ya no hay
listener en la interfaz publica, y el NSG los sigue bloqueando).

Acceso legitimo para administracion remota, via tunel SSH:

```bash
ssh -i uvg-collab-server_key.pem -L 5432:localhost:5432 azureuser@158.23.57.118
```

`[Completar]`: captura del Network Security Group (NSG) de Azure confirmando
que 5432/5050 no tienen regla de entrada publica.

### Casos cubiertos — `security-exposed-ports.spec.ts`

| Caso | Cubierto |
|---|---|
| `postgres`/`pgadmin`/`redis` publicados sin loopback en cualquier archivo de Compose versionado | Si |
| Puerto restringido a `127.0.0.1` en forma larga (3 segmentos) | Si (se acepta) |
| Puerto en forma corta (2 segmentos, publica en `0.0.0.0`) fuera de la allowlist | Si (falla) |
| 3000 y 3001 (backend/frontend, detras del reverse proxy) | Si (permitidos explicitamente) |
| Regresion: test de control que falla si la extraccion de puertos queda vacia (evita un spec que "pasa" sin revisar nada) | Si |

## T-127 (IESUC-285) — Pruebas de seguridad: JWT, IDOR y rate limiting

### Hallazgo (JWT — defecto real, no solo cobertura faltante)

Al escribir `security-jwt.spec.ts` se confirmo que el token de recuperacion
de contrasena (HU-14, emitido en `AdminService.generarEnlaceRecuperacion`)
podia usarse como credencial de sesion completa:

- Se firma con el mismo `JWT_SECRET` que los tokens de acceso normales.
- TTL de 1 hora (`RESET_TOKEN_TTL`), mas largo que el access token (45 min).
- `JwtStrategy.validate()` (usada por `JwtAuthGuard` en toda ruta protegida)
  solo leia `payload.sub`/`payload.correo`; nunca revisaba `payload.tipo`.

Con eso, un token de reset interceptado (viaja en una URL) autenticaba
cualquier endpoint protegido durante su hora de vigencia, sin pasar por
`/auth/reset-password`. Se confirmo el hallazgo con el usuario antes de
corregirlo (no se ajusto el test para que "pasara" sobre el codigo con el
defecto).

De forma relacionada, `JwtStrategy.validate()` tampoco revalidaba el
`estado` del usuario contra la base de datos: un usuario suspendido
conservaba su sesion hasta el vencimiento natural del token.

### Medida aplicada

`apps/backend/src/auth/jwt.strategy.ts`:

- Rechaza cualquier payload con `tipo` presente (los tokens de acceso/
  refresh nunca llevan ese campo; solo el de reset lo lleva).
- Consulta `usuario.estado` en cada autenticacion y rechaza si no es
  `ACTIVO` (usuario no encontrado incluido).

`apps/backend/src/auth/auth.controller.ts`: se agrego `@Throttle` dedicado
(5 intentos/60s) a `login`, `forgot-password` y `reset-password` — no existia
ninguno antes, solo los buckets globales de `ThrottlerModule.forRoot`.

### Verificacion

```bash
cd apps/backend
npx vitest run test/security-jwt.spec.ts test/security-idor.spec.ts test/security-rate-limiting.spec.ts test/security-exposed-ports.spec.ts
npm run test -- --run
npm run test:coverage -- --run
npm run lint
```

Suite completa: 89 archivos, 1778 tests, 0 fallos. Cobertura global tras el
cambio: lines 80.35 / branches 90.24 / functions 76.59 / statements 80.35
(umbrales del repo: 65/80/65/65 — todos por encima). Lint sin errores.

### Casos cubiertos — `security-jwt.spec.ts`

| Caso | Cubierto |
|---|---|
| Access token valido de usuario ACTIVO | Si (camino positivo) |
| Firma alterada | Si |
| Firmado con otro secreto | Si |
| Algoritmo `none` | Si |
| Token vencido | Si |
| Payload manipulado (`sub` cambiado sin volver a firmar) | Si |
| Token de reset (HU-14) usado como sesion normal | Si (bloqueado tras la correccion) |
| Usuario del token ya no existe | Si |
| Usuario con `estado` != `ACTIVO` (`INACTIVO`, `BLOQUEADO`) | Si |
| Payload firmado en login/register sin contrasena ni hash | Si |

### Casos cubiertos — `security-idor.spec.ts`

No duplica lo ya cubierto por `tasks-queries-isolation.spec.ts` (tarea de
otro proyecto -> 404 sin fuga de datos, listado acotado al proyecto propio),
`tasks-authorization.service.spec.ts` ni `sprints-authorization.service.spec.ts`
(matriz lider/participante/externo, ya exhaustiva). Este spec ejercita las
implementaciones reales de `TasksContextService`, `NotificationsService` y
`ExitRequestsAuthorizationService` contra un Prisma simulado, para probar el
filtro de la consulta misma, no solo el resultado.

| Caso | Cubierto |
|---|---|
| Consulta de pertenencia filtra por `estadoParticipacion: ACTIVO` | Si |
| Participante `RETIRADO` pierde el acceso | Si |
| Pertenecer al proyecto B no da acceso al proyecto A | Si |
| Tarea con `eliminadoEn` no nulo, inaccesible | Si |
| No se puede marcar como leida una notificacion ajena (403, no 200) | Si |
| `markAllAsRead` acotado siempre al usuario autenticado | Si |
| Lider real del proyecto resuelve su propia solicitud de salida | Si (camino positivo) |
| Lider de OTRO proyecto (privilegio real, proyecto equivocado) rechazado | Si |
| Usuario sin relacion con el proyecto rechazado | Si |
| Ningun caso filtra datos del recurso ajeno en el mensaje de error | Si |

### Casos cubiertos — `security-rate-limiting.spec.ts`

| Caso | Cubierto |
|---|---|
| `ThrottlerGuard` registrado como `APP_GUARD` (no solo `ThrottlerModule` importado) | Si |
| `ttl`/`limit` declarados con valores razonables en cada bucket | Si |
| Sin `@SkipThrottle` en `AuthController` | Si |
| `@Throttle` dedicado en `login` (<=5/60s) | Si |
| `@Throttle` dedicado en `forgot-password` (<=5/60s) | Si |
| Helmet activo (`app.use(helmet())`) | Si |
| `ValidationPipe` global con `whitelist`/`forbidNonWhitelisted` | Si |
| CORS sin `origin: "*"` | Si |
