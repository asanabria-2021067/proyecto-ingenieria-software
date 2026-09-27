# Baseline nginx de producción (G02-C16 · OWASP25-C047)

Copia versionada y verificable del nginx que hoy sirve UVG Collab, **sin cambios de comportamiento**. Sirve para que cualquier cambio posterior de topología sea revisable y reversible por PR.

| Archivo | Origen en la VM | Modo |
|---|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` | Verbatim (mismo SHA-256 que producción). Configuración global compartida del host: referencia de solo lectura |
| `sites-enabled/uvg-collab` | `/etc/nginx/sites-enabled/uvg-collab` (único site habilitado) | Saneado: sin los `location` de estáticos de otros proyectos (ver `manifest.json`) |

Los SHA-256 vivos y versionados, la fecha de captura y las exclusiones declaradas están en `manifest.json`.

## Reglas

- Este directorio **no se despliega**: la VM no lo lee. Aplicar un cambio en producción lo hace el sudoer con copia fechada previa, `nginx -t` y reload (runbooks de G04/G06).
- El server es compartido ("un nginx, tres dueños"). Los `location` ajenos no se versionan ni se modifican desde aquí. Todo cambio a nivel `server` (redirección H4, HSTS H7) requiere `REQUIRES_TEAM_APPROVAL`.
- P1 (`location /socket.io/`) **no** está incluido: lo introduce G04.

## Verificar que la copia viva sigue igual

Con una copia de solo lectura de los archivos vivos:

```bash
node infra/nginx/compare-live.mjs <copia-del-site> [<copia-de-nginx.conf>]
```

Sale con 0 si la configuración viva equivale al baseline (exclusiones declaradas aparte) y con 1 ante cualquier diferencia no declarada.
