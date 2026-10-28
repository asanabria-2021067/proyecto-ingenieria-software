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

## Pendiente de aplicar en la VM

El site y `nginx.conf` versionados son el estado **objetivo**; la VM aún no los tiene (`pendingLiveChanges` en `manifest.json`, `appliedInProduction: false`). Ambos requieren `REQUIRES_TEAM_APPROVAL` y los aplica el Gate Admin con copia fechada previa, `nginx -t` y reload.

| Gate | Cambio |
|---|---|
| G06-H4 | Redirección 80 -> 443 en un `server` propio (`location /` con `return 301`; el desafío ACME sigue sirviéndose por HTTP) |
| G06-H7 | `Strict-Transport-Security: max-age=31536000` en el server 443 (sin `includeSubDomains` ni `preload`: el dominio es un nip.io compartido; `proxy_hide_header` en `/api` oculta el de Helmet para no duplicarlo), `server_tokens off` y `ssl_protocols TLSv1.2 TLSv1.3` |

- **Orden:** aplicar la redirección **antes** de que el deploy ponga `COOKIE_SECURE=true`; si no, quien entre por http pierde la sesión sin error.
- **Certificado:** el de `158.23.57.118.nip.io` vence el 2026-11-19. Con HSTS vigente un certificado vencido no tiene salida para el usuario: renovar y verificar con `node infra/tls/cert-expiry-probe.mjs --host <host> --port 443` **antes** de aplicar HSTS.
- **Redirección:** va al nombre canónico `https://158.23.57.118.nip.io` (el certificado solo cubre ese host; con `$host`, quien entre por la IP desnuda terminaba en un certificado que no coincide). Quien use la URL antigua `http://158.23.57.118/` queda redirigido al nombre canónico.
- **Locations ajenos:** `/angel/`, `/derek/` y `/vernel/` del host real quedan en el server 443. Si alguno define su propio `add_header`, anula la herencia del HSTS (verificar en la VM).
- `compare-live.mjs`: mientras haya cambios sin aplicar, la copia viva de `nginx.conf` se compara contra `liveSha256` y el site muestra como diferencias esperadas las de H4/H7 (la comparación es por posición de línea: una inserción desplaza el resto y genera ruido; revisar contra el diff del PR). `ssl_protocols` está en `http{}` y afecta a todo el host compartido: requiere el visto bueno de los otros dueños del nginx.

<!-- secretos-github -->

## Secretos, variables y environment de GitHub

Los workflows `deploy.yml` y `k6.yml` dependen de lo siguiente. Si algo falta, el deploy aborta antes de tocar la VM.

### Secretos SSH nuevos (obligatorios)

| Secreto | Contenido |
|---|---|
| `SSH_KNOWN_HOSTS` | Linea(s) de `known_hosts` de la VM |
| `SSH_HOST_FINGERPRINT` | Huella de la clave de host, formato `SHA256:...` |

Cómo obtenerlos:

```bash
# desde una maquina de confianza: todas las claves de host (valor de SSH_KNOWN_HOSTS)
ssh-keyscan -t ed25519,ecdsa,rsa <SERVER_IP>

# huella para SSH_HOST_FINGERPRINT: la de la clave que negocia el cliente de appleboy/ssh-action
ssh-keyscan -t ecdsa <SERVER_IP> | ssh-keygen -lf -     # copiar solo el campo SHA256:...
```

El cliente SSH de `appleboy/ssh-action` (golang.org/x/crypto, drone-ssh 1.8.0) no fija el algoritmo de la clave de host y prefiere **ECDSA**, luego RSA y por último ED25519: la huella de `ssh_host_ed25519_key.pub` puede no ser la que se compara y el despliegue fallaría con `fingerprint mismatch` (falla cerrada, antes de tocar los contenedores). Si la VM no tiene clave ECDSA, usa la del tipo que exista y revisa el primer despliegue. El valor es solo el campo `SHA256:...`, no la línea completa de `ssh-keygen -lf`.

Compara fuera de banda (por la consola de la VM, no por la misma conexion) que las huellas de `ssh-keyscan` coinciden con las de `ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub` antes de guardar los secretos. Un valor vacio degradaria en silencio la verificacion del host (`appleboy/ssh-action` sin `fingerprint` no verifica), por eso el workflow aborta si cualquiera de los dos esta vacio. `StrictHostKeyChecking` ya es `yes`: ya no se acepta una clave nueva en la primera conexion.

### Variables

| Variable | Default | Nota |
|---|---|---|
| `COOKIE_SECURE` | `true` | Hoy no esta definida en GitHub: al fusionar, el siguiente deploy activa cookies `Secure` (requiere HTTPS en todo el trafico) |
| `TRUST_PROXY_HOPS` | `1` | Ya vale 1 en GitHub; el backend ahora falla al arrancar en produccion con `0` |

### Secreto existente: `CLOUDINARY_CLOUD_NAME`

Ya se usaba para el build del frontend; ahora tambien se escribe en el `.env` del backend (solo si no esta vacio) para el validador de `fotoUrl` y los adaptadores de Cloudinary.

### Environment `production`

Los jobs `deploy` (deploy.yml) y `k6` (k6.yml) declaran `environment: production`. Hoy ese environment **no existe**: GitHub lo crea solo y sin proteccion en la primera ejecucion. Crealo antes del primer merge, con "Deployment branches: main" y revisores opcionales. Con revisores requeridos, cada deploy y el cron semanal de k6 esperan aprobacion. Para que el environment aporte proteccion, mueve los secretos de despliegue (`SSH_*`, `SERVER_*`, `DB_*`, `JWT_*`) a secretos del environment.

### k6

- `K6_FIXTURE_PASSWORD`: no existe todavia; crealo.
- `PUBLIC_APP_URL` (usado como `K6_BASE_URL`): con `BACKEND_BIND=127.0.0.1` (valor definido hoy en GitHub; el default de `deploy.yml` es `0.0.0.0`) el puerto 3001 no es alcanzable desde un runner. Usa `https://158.23.57.118.nip.io`; ojo: el `K6_BASE_URL` por defecto de `k6.yml` (`http://158.23.57.118:3001`) sigue sin funcionar y un 301 rompería los POST de login, por eso debe ser https.
- `k6.yml` usa el mismo `SSH_KNOWN_HOSTS` para el tunel a Postgres.

### Orden de aplicacion

1. Crear los secretos `SSH_KNOWN_HOSTS` y `SSH_HOST_FINGERPRINT`.
2. Crear el environment `production`.
3. Aplicar la redireccion 80 -> 443 en la VM.
4. Fusionar. La proxima ejecucion de deploy aborta si faltan los secretos SSH.
