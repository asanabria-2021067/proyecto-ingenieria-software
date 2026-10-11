#!/usr/bin/env bash
# T-313 · respaldo de PostgreSQL con pg_dump en formato custom (-Fc).
#
#   infra/db-backup/pg-backup.sh [archivo.env]
#
# El respaldo se escribe en BACKUP_DIR, que vive en el HOST: fuera del
# contenedor de la base y fuera del repositorio. Se escribe primero en un
# temporal, se verifica y solo entonces se renombra (mv atómico): un volcado
# que falló o quedó a medias nunca aparece con nombre de respaldo válido.
#
# Configuración: variables de entorno o un archivo .env (ver
# backup.example.env). La contraseña llega solo por PGPASSWORD o PGPASSFILE:
# nunca por argumentos, y este script no imprime ni registra credenciales.
#
# Códigos de salida: 0 ok · 64 configuración · 73 destino · 74 volcado o
# verificación · 75 ya hay otro respaldo en curso.
set -euo pipefail
umask 077

log() { printf '%s pg-backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { local code="$1"; shift; log "ERROR: $*" >&2; exit "$code"; }

# --- configuración -----------------------------------------------------------
ENV_FILE="${1:-${BACKUP_ENV_FILE:-}}"
if [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || die 64 "no existe el archivo de configuración"
  # Lleva la contraseña: solo su dueño puede leerlo.
  perms="$(stat -c '%a' "$ENV_FILE")"
  case "$perms" in 600 | 400) ;; *) die 64 "el archivo de configuración debe tener permisos 600 o 400 (tiene $perms)" ;; esac
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${BACKUP_DIR:?define BACKUP_DIR (directorio del host, fuera del repositorio)}"
BACKUP_PREFIX="${BACKUP_PREFIX:-uvgenius}"
BACKUP_MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-500}"
PG_CONTAINER="${PG_CONTAINER:-}"
PGDATABASE="${PGDATABASE:-}"
PGUSER="${PGUSER:-}"

[ -n "$PGDATABASE" ] || die 64 "define PGDATABASE"
[ -n "$PGUSER" ] || die 64 "define PGUSER"
case "$BACKUP_DIR" in /*) ;; *) die 64 "BACKUP_DIR debe ser una ruta absoluta" ;; esac
# El prefijo y la base forman el nombre del archivo y el patrón de rotación: solo caracteres seguros.
case "$BACKUP_PREFIX" in '' | *[!A-Za-z0-9-]*) die 64 "BACKUP_PREFIX solo admite letras, números y guiones" ;; esac
case "$PGDATABASE" in *[!A-Za-z0-9_-]*) die 64 "PGDATABASE solo admite letras, números, guiones y guiones bajos" ;; esac
case "$BACKUP_MIN_FREE_MB" in '' | *[!0-9]*) die 64 "BACKUP_MIN_FREE_MB debe ser un número entero" ;; esac
if [ -z "${PGPASSWORD:-}" ] && [ -z "${PGPASSFILE:-}" ]; then
  die 64 "define PGPASSWORD o PGPASSFILE"
fi

# --- destino -----------------------------------------------------------------
mkdir -p "$BACKUP_DIR" || die 73 "no se pudo crear BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || die 73 "no se pudieron fijar los permisos de BACKUP_DIR"
[ -w "$BACKUP_DIR" ] || die 73 "BACKUP_DIR no admite escritura"
if git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die 73 "BACKUP_DIR está dentro de un repositorio Git: los respaldos contienen datos personales"
fi

# Un solo respaldo a la vez: un cron solapado no pisa al anterior.
exec 9>"$BACKUP_DIR/.pg-backup.lock"
flock -n 9 || die 75 "ya hay otro respaldo en curso"

free_mb="$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
case "$free_mb" in '' | *[!0-9]*) die 73 "no se pudo medir el espacio libre de BACKUP_DIR" ;; esac
[ "$free_mb" -ge "$BACKUP_MIN_FREE_MB" ] || die 73 "espacio libre insuficiente: ${free_mb} MB (mínimo ${BACKUP_MIN_FREE_MB} MB)"

# --- volcado -----------------------------------------------------------------
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/${BACKUP_PREFIX}_${PGDATABASE}_${stamp}.dump"
tmp="$BACKUP_DIR/.${BACKUP_PREFIX}_${PGDATABASE}_${stamp}.dump.tmp.$$"
trap 'rm -f "$tmp"' EXIT

# PG_CONTAINER: pg_dump corre DENTRO del contenedor de la base (misma versión
# que el servidor) y su salida viaja por stdout al archivo del host. `-e
# PGPASSWORD` pasa la variable sin escribir su valor en la línea de comandos.
dump() {
  if [ -n "$PG_CONTAINER" ]; then
    docker exec -i -e PGPASSWORD -e PGDATABASE -e PGUSER "$PG_CONTAINER" "${PG_DUMP_BIN:-pg_dump}" --format=custom --no-password
  else
    "${PG_DUMP_BIN:-pg_dump}" --format=custom --no-password
  fi
}
listing() {
  if [ -n "$PG_CONTAINER" ]; then
    docker exec -i "$PG_CONTAINER" "${PG_RESTORE_BIN:-pg_restore}" --list
  else
    "${PG_RESTORE_BIN:-pg_restore}" --list
  fi
}

export PGDATABASE PGUSER
log "inicio: base ${PGDATABASE}${PG_CONTAINER:+ (contenedor ${PG_CONTAINER})}"
dump >"$tmp" || die 74 "pg_dump falló; no se creó ningún respaldo y los anteriores quedan intactos"

# --- verificación ------------------------------------------------------------
[ -s "$tmp" ] || die 74 "pg_dump no produjo datos"
[ "$(head -c 5 "$tmp")" = "PGDMP" ] || die 74 "el archivo no tiene formato custom de pg_dump"
entries="$(listing <"$tmp" | grep -vc '^;' || true)"
case "$entries" in '' | *[!0-9]*) entries=0 ;; esac
[ "$entries" -gt 0 ] || die 74 "pg_restore --list no reconoce el respaldo"

chmod 600 "$tmp"
mv -f "$tmp" "$final"
trap - EXIT
( cd "$BACKUP_DIR" && sha256sum "$(basename "$final")" >"$(basename "$final").sha256" )
log "ok: $(basename "$final") ($(du -k "$final" | cut -f1) KB, ${entries} objetos)"
