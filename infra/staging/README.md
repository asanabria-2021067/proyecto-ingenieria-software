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

`infra/staging/nginx` solo puede diferir de `infra/nginx` por las sustituciones de `substitutions.json` (usuario de la imagen, rutas del certificado y upstreams por la red interna). `check-representativity.mjs` deshace esas sustituciones y exige igualdad exacta: cualquier otra diferencia falla. Si un gate cambia `infra/nginx` (p. ej. P1 en G04), la copia del arnés se actualiza en el mismo commit.

## Uso

```bash
infra/staging/run-harness.sh
```

Ejecuta el guard, genera el TLS, construye y levanta todo (`--wait`), corre `characterize.mjs` y destruye contenedores, volúmenes, imágenes locales del proyecto y el TLS, también si algo falla. Puertos: `127.0.0.1:${HARNESS_HTTP_PORT:-8080}` y `127.0.0.1:${HARNESS_HTTPS_PORT:-8443}`.

`characterize.mjs` fija el comportamiento **actual** (HARN-01…05: HSTS/Helmet en `/api`, 403 con `Accept: text/html`, `/socket.io` → 308 sin P1, `/` sin cabeceras de seguridad, HTTP sin redirección). Los gates que cambien ese comportamiento a propósito actualizan la expectativa en su propio commit. El script rechaza cualquier host que no sea local.

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
