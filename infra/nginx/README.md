# Baseline nginx de producción (G02-C16 · OWASP25-C047)

Copia versionada y verificable del nginx de UVG Collab. Sirve para que cualquier cambio posterior de topología sea revisable y reversible por PR. G02-C16 lo capturó **sin cambios de comportamiento**; desde G04-C11 el site versionado es el estado **objetivo** con P1 (ver abajo).

| Archivo | Origen en la VM | Modo |
|---|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` | Verbatim (mismo SHA-256 que producción). Configuración global compartida del host: referencia de solo lectura |
| `sites-enabled/uvg-collab` | `/etc/nginx/sites-enabled/uvg-collab` (único site habilitado) | Saneado: sin los `location` de estáticos de otros proyectos (ver `manifest.json`) |

Los SHA-256 vivos y versionados, la fecha de captura y las exclusiones declaradas están en `manifest.json`.

## Reglas

- Este directorio **no se despliega**: la VM no lo lee. Aplicar un cambio en producción lo hace el sudoer con copia fechada previa, `nginx -t` y reload (runbooks de G04/G06).
- El server es compartido ("un nginx, tres dueños"). Los `location` ajenos no se versionan ni se modifican desde aquí. Todo cambio a nivel `server` (redirección H4, HSTS H7) requiere `REQUIRES_TEAM_APPROVAL`.
- P1 (G04-C11) **está aplicado en la VM** desde 2026-10-04 (T-332/HU-187; ver `pendingLiveChanges` en `manifest.json`): `location /socket.io/` hacia el backend con Upgrade/Connection y timeouts de 120s, y upstreams explícitos `127.0.0.1` en `/` y `/api` (antes `localhost`). No tocó redirecciones, HSTS, TLS, `nginx.conf` ni los `location` ajenos. Copia fechada previa: `/etc/nginx/sites-enabled/uvg-collab.bak-20261004-0753`.

## Verificar que la copia viva sigue igual

Con una copia de solo lectura de los archivos vivos:

```bash
node infra/nginx/compare-live.mjs <copia-del-site> [<copia-de-nginx.conf>]
```

Sale con 0 si la configuración viva equivale al baseline (exclusiones declaradas aparte) y con 1 ante cualquier diferencia no declarada. Mientras P1 no se aplique, la diferencia esperada es exactamente P1; tras aplicarlo, el comparador debe salir con 0 y `liveSha256` se actualiza con la nueva captura.
