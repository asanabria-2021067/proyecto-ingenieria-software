# Revisión cruzada de autenticación (T-210 / HU-152)

Revisión cruzada del cambio de autenticación de refresh tokens (HU-152), pendiente desde su
implementación y sin evidencia previa de que hubiera ocurrido. Alcance: `apps/backend/src/auth/`
(`auth.service.ts`, `auth.controller.ts`, `jwt.strategy.ts`, `cookie.util.ts`) y los 4
`JwtModule.registerAsync` que firman/verifican con `JWT_SECRET` (`auth`, `admin`, `notifications`,
`chat`).

## 1. ¿El refresh token se invalida al usarse (rotación), o se puede reutilizar?

**Se rota correctamente.** `AuthService.refreshToken` marca `revocadoEn` en el registro usado
(`tokenHash` en la tabla `TokenRefresco`) en la misma llamada que emite el par nuevo
(`auth.service.ts:227-230`). Un reintento con el mismo refresh token se topa con
`registro.revocadoEn` ya seteado y es rechazado (`auth.service.ts:221`).

Cubierto por `test/auth.service.spec.ts` (`refreshToken` > "rota el token: revoca el usado y emite
un par nuevo", "rechaza un refresh ya revocado").

## 2. ¿Se invalida al cerrar sesión?

**Sí.** `AuthService.logout` revoca (`revocadoEn`) el refresh token de la cookie de la sesión que
cierra sesión (`auth.service.ts:235-241`), y `AuthController.logout` limpia además ambas cookies.

**Gap encontrado:** no existía ninguna prueba de este flujo — se asumía. Se agregó
`describe('logout (T-210)', …)` en `test/auth.service.spec.ts`: confirma que revoca únicamente el
token de la sesión (vía su hash) y que sin refresh token no toca la base.

## 3. ¿`JWT_REFRESH_SECRET` es distinto de `JWT_SECRET` y sin valor por defecto?

**Distinto:** sí, son dos variables independientes.

**Sin valor por defecto:** `JWT_REFRESH_SECRET` ya era estricto (el constructor de `AuthService`
lanza si falta, `auth.service.ts:33-37`). **`JWT_SECRET` NO lo era — problema real, corregido en
este PR.**

Los 6 puntos que leían `JWT_SECRET` (`auth.service.ts`, `jwt.strategy.ts`, y los
`JwtModule.registerAsync` de `auth`, `admin`, `notifications` y `chat`) caían a un valor por
defecto público y conocido (`'dev-secret-change-me'`) si la variable faltaba — igual que
`docker-compose.yml` y `docker-compose.example.yml`, que la exponían como
`${JWT_SECRET:-dev-secret-change-me}`. Si `JWT_SECRET` quedaba sin definir en un entorno
desplegado, cualquiera que conociera ese default público podía forjar un access token válido para
cualquier `idUsuario` — exactamente el tipo de fallo que "no falla visible: deja entrar a quien no
debe".

**Corregido:**
- Nuevo `apps/backend/src/config/jwt-secret.ts`: `getRequiredJwtSecret()` (para `auth.service.ts` y
  `jwt.strategy.ts`, que ya leían `process.env` directo) y `requireJwtSecret(value)` (para los 4
  `JwtModule.registerAsync`, que siguen inyectando `ConfigService` — invariante ya cubierta por
  `test/s7-environment.spec.ts` TC03-D). Ambas lanzan si la variable falta o está vacía, sin caer a
  ningún default.
- `docker-compose.yml` y `docker-compose.example.yml`: `JWT_SECRET` pasa a
  `${JWT_SECRET:?debes definir JWT_SECRET, no tiene valor por defecto}`, igual que ya tenía
  `JWT_REFRESH_SECRET`.
- Prueba nueva `test/jwt-secret.spec.ts` para el helper.

## 4. ¿Las cookies son `httpOnly`, `secure` y `sameSite` donde corresponde?

`cookie.util.ts` — `httpOnly: true` siempre, `sameSite: 'lax'` siempre. `secure` sigue a
`COOKIE_SECURE` (por defecto `false`): el despliegue actual sirve por HTTP plano, así que una
cookie `secure` sería descartada silenciosamente por el navegador y la sesión nunca prendería
(comentario ya presente en el código). Activar `COOKIE_SECURE=true` es responsabilidad del
despliegue cuando haya TLS; el código está listo para eso.

**Gap encontrado:** sin pruebas — se agregó `test/cookie-util.spec.ts` (httpOnly/sameSite
constantes, `secure` sigue a `COOKIE_SECURE`, `clearAuthCookies` limpia ambas cookies en `path:
'/'`).

## 5. ¿Un refresh token vencido o manipulado se rechaza?

**Sí, en ambos casos:**
- Firma inválida o vencimiento del JWT: `jwtService.verify` lanza, capturado y traducido a 401
  (`auth.service.ts:206-212`).
- Vencimiento propio de la tabla (`expiraEn < new Date()`) y revocado (`revocadoEn`): rechazados
  aunque la firma JWT siga siendo válida (`auth.service.ts:221-223`).
- Un access token no es aceptado como refresh token: se verifica `payload.tipo === 'refresh'`
  (`auth.service.ts:214-216`).

Cubierto por `test/auth.service.spec.ts` (rechaza revocado / expirado / firma inválida / tipo
distinto) y `test/security-jwt.spec.ts` para el guard de acceso equivalente en `JwtStrategy`.

## 6. ¿Hay pruebas de cada punto, o se asumen?

Antes de este PR: rotación, revocado, expirado y tipo — con prueba. Logout y flags de cookie — sin
prueba, asumidos. Después de este PR, los 6 puntos tienen prueba (ver arriba).

## Resumen

| Punto | Estado antes | Acción |
| --- | --- | --- |
| Rotación de refresh | OK, con prueba | Ninguna |
| Invalidación en logout | OK, sin prueba | Prueba agregada |
| `JWT_REFRESH_SECRET` distinto y sin default | OK | Ninguna |
| `JWT_SECRET` sin default | **Vulnerable** | Corregido (helper + docker-compose) |
| Cookies httpOnly/secure/sameSite | OK, sin prueba | Prueba agregada |
| Refresh vencido/manipulado rechazado | OK, con prueba | Ninguna |
