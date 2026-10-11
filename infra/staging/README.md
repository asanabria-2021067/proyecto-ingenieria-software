# Arnés efímero de topología (G02-C17 · D4)

Staging de la Fase 2: **efímero**, en el runner de GitHub o en local, **nunca** en la VM. Reproduce la estructura de producción para probar lo que no se puede probar con tests unitarios (nginx, TLS, cabeceras, tiempo real).

| Pieza | Arnés | Producción |
|---|---|---|
| nginx | `nginx:1.27-alpine` con `infra/staging/nginx` | nginx del host con `infra/nginx` |
| Backend / frontend | Construidos con los **Dockerfiles de producción** | Imágenes de GHCR de esos mismos Dockerfiles |
| PostgreSQL / Redis | 17 / 7, efímeros | 17 / 7 |
| TLS | Autofirmado, generado en cada corrida fuera del repo | Let's Encrypt |
| Datos | Ninguno (sin seed): solo el esquema de las migraciones | Reales |
| Secretos | Sintéticos | Reales |

## Representatividad

`infra/staging/nginx` solo puede diferir de `infra/nginx` por las sustituciones de `substitutions.json` (usuario de la imagen, rutas del certificado y upstreams por la red interna), cada una tantas veces como declara (`occurrences`, por defecto 1). `check-representativity.mjs` deshace esas sustituciones y exige igualdad exacta: cualquier otra diferencia falla. Si un gate cambia `infra/nginx` (p. ej. P1 en G04), la copia del arnés se actualiza en el mismo commit.

## Uso

```bash
infra/staging/run-harness.sh
```

Ejecuta el guard, genera el TLS, construye y levanta todo (`--wait`), corre `characterize.mjs` y destruye contenedores, volúmenes, imágenes locales del proyecto y el TLS, también si algo falla. Puertos: `127.0.0.1:${HARNESS_HTTP_PORT:-8080}` y `127.0.0.1:${HARNESS_HTTPS_PORT:-8443}`.

`characterize.mjs` fija el comportamiento **actual** (HARN-01…05: HSTS/Helmet en `/api`, 403 con `Accept: text/html`, `/socket.io` → backend con P1 (G04-C11; antes 308 del frontend), `/` con las cabeceras base del frontend y sin HSTS (G06-C02; antes sin ninguna), HTTP sin redirección). Los gates que cambien ese comportamiento a propósito actualizan la expectativa en su propio commit. Además, T13 (G04-C12) exige que Socket.IO atraviese nginx: el polling responde 200 con el paquete OPEN y su `sid` (T13-01) y ese `sid` pasa a WebSocket con 101 (T13-02). T16 (G04-C13): el backend del arnés corre con `TRUST_PROXY_HOPS=1` y seis logins con un `X-Forwarded-For` falso distinto cada uno siguen recibiendo 429 en el sexto (T16-01); solo se imprimen códigos HTTP. El script rechaza cualquier host que no sea local.

## En CI (G02-C18)

Job `topology` de `ci.yml` («Topologia - arnes efimero (nginx + TLS)»):

| Disparo | ¿Corre? |
|---|---|
| PR → `main` | Siempre |
| PR → `develop` | Solo si el PR toca realtime, nginx, cabeceras, Dockerfiles/compose o el propio arnés (`should-run.mjs`); si no puede calcular el diff, corre |
| `workflow_dispatch` | Sí |
| Push a `develop` / `workflow_call` del deploy | No |

## Alcance a producción

**NONE**: sin hosts externos, sin secretos reales, sin publicación ni deploy.

## T17 / T18 / T21 (G06-C08)

Sobre HTTPS local (certificado autofirmado efímero):

- **T17**: `/` y `/login` llevan exactamente las cabeceras base del frontend (nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, CSP `frame-ancestors 'none'`), la CSP Report-Only con sus directivas clave, sin `X-Powered-By` y sin HSTS.
- **T21**: `/api` y `/api/proyectos` devuelven exactamente `max-age=31536000; includeSubDomains`, nunca `preload`.
- **T18**: `run-harness.sh` inserta **una** carrera sintética en la base efímera. Un registro vía nginx debe responder 201 **sin** cookies de sesión (la cuenta queda pendiente de verificación) y el login de esa cuenta debe responder 403 con el mensaje de cuenta pendiente, también sin cookies. Ese login cuenta para el límite de 5/min, así que T16 espera su 429 un intento antes. Los atributos `Secure`, `HttpOnly`, `SameSite=Lax` y `Path=/` de las cookies ya no se comprueban en el arnés: requieren una sesión de una cuenta aprobada. Solo se reportan estados y nombres, nunca valores.

## T14 (G07-C12)

El frontend del arnés se construye con la **variante same-origin** (`NEXT_PUBLIC_API_URL` vacía, la misma que hornea `PUBLIC_API_URL=same-origin` en `deploy.yml`). `realtime.mjs` corre después de `characterize.mjs`, con clientes Socket.IO mínimos (Engine.IO v4 sobre el WebSocket de Node 22 y sobre polling HTTPS con la cookie de sesión), todo a través de nginx:

| Id | Comprueba |
|---|---|
| T14-01 | El bundle del navegador (`.next/static`) no contiene `:3001` ni la IP de la API |
| T14-02/03 | Un access token de una cuenta ACTIVO conecta a `/notifications` y `/chat` por `wss://` del mismo origen |
| T14-04 | La ruta del navegador (polling + cookie `access_token`) pasa por la política; un refresh en esa cookie no |
| T14-05 | Una notificación llega en vivo (flujo real de recuperación → admin) |
| T14-06 | Un token de reset emitido por el admin no abre sockets |
| T14-07 | Un refresh token no abre sockets |
| T14-08 | Chat en vivo: conversación nueva, `joinConversation` con ack, `newMessage`; un ajeno no se une ni recibe |
| T14-09 | Al BLOQUEAR una cuenta sus sockets abiertos se cierran (G07-C04), la reconexión se rechaza y las demás cuentas siguen conectadas |
| T14-10 | Lo mismo al INACTIVAR |

Usa cuatro registros sintéticos (el límite de `/auth/register` es 5/min y T18 ya usa uno), el rol `administrador` y un proyecto con un participante insertados por SQL en la base efímera. Nunca imprime tokens, cookies ni correos.

**Tramo de navegador (opcional):** `HARNESS_BROWSER=1 infra/staging/run-harness.sh` ejecuta además `apps/frontend/e2e-harness` con `playwright.harness.config.ts` (requiere las dependencias y el Chromium de Playwright del frontend): el dashboard abre el socket en `wss://<origen>/socket.io/`, recibe `connected` y ninguna petición va a `:3001` ni a la IP. La sesión sintética viaja en un archivo `0600` del directorio temporal del arnés, que se borra al final. El job `topology` de CI corre T14 a nivel de protocolo; el tramo de navegador no, porque ese job no instala dependencias.
