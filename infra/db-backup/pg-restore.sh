#!/usr/bin/env bash
# T-314 · restauración de un respaldo de pg-backup.sh con pg_restore.
#
#   infra/db-backup/pg-restore.sh ARCHIVO.dump [archivo.env] [--sobre-produccion]
#
# Por defecto restaura en una base NUEVA y temporal
# (uvg_collab_restore_<AAAAMMDDTHHMMSSZ>): nunca toca una base existente. Para
# restaurar sobre la base productiva hace falta el flag --sobre-produccion, una
# confirmación escrita exacta y, antes de tocar nada, un respaldo de seguridad
# con pg-backup.sh.
#
# Configuración: igual que pg-backup.sh (variables de entorno o un archivo
# .env). La contraseña llega solo por PGPASSWORD o PGPASSFILE, nunca por
# argumentos; con PG_CONTAINER no hace falta. Este script no imprime ni
# registra credenciales.
#
# Códigos de salida: 0 ok · 64 configuración o confirmación faltante/incorrecta
# · 73 destino (no se pudo crear o abrir la base) · 74 restauración o
# verificación del respaldo fallida · 75 ya hay otra restauración de este
# respaldo en curso.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

log() { printf '%s pg-restore: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { local code="$1"; shift; log "ERROR: $*" >&2; exit "$code"; }

# --- argumentos ---------------------------------------------------------------
SOBRE_PRODUCCION=0
args=()
for arg in "$@"; do
  case "$arg" in
    --sobre-produccion) SOBRE_PRODUCCION=1 ;;
    -*) die 64 "opción desconocida: $arg" ;;
    *) args+=("$arg") ;;
  esac
done
DUMP_FILE="${args[0]:-}"
ENV_FILE="${args[1]:-${BACKUP_ENV_FILE:-}}"
[ -n "$DUMP_FILE" ] || die 64 "uso: pg-restore.sh ARCHIVO.dump [archivo.env] [--sobre-produccion]"
[ -f "$DUMP_FILE" ] || die 64 "no existe el respaldo: $DUMP_FILE"

# --- configuración -------------------------------------------------------------
if [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || die 64 "no existe el archivo de configuración"
  perms="$(stat -c '%a' "$ENV_FILE")"
  case "$perms" in 600 | 400) ;; *) die 64 "el archivo de configuración debe tener permisos 600 o 400 (tiene $perms)" ;; esac
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PG_CONTAINER="${PG_CONTAINER:-}"
PGUSER="${PGUSER:-}"
PGADMINDB="${PGADMINDB:-postgres}"

[ -n "$PGUSER" ] || die 64 "define PGUSER"
if [ -z "$PG_CONTAINER" ] && [ -z "${PGPASSWORD:-}" ] && [ -z "${PGPASSFILE:-}" ]; then
  die 64 "define PGPASSWORD o PGPASSFILE"
fi
export PGUSER

# --- verificación del respaldo -------------------------------------------------
SHA_FILE="$DUMP_FILE.sha256"
[ -f "$SHA_FILE" ] || die 74 "no existe $SHA_FILE; no se puede confiar en este respaldo"
( cd "$(dirname "$DUMP_FILE")" && sha256sum -c --status "$(basename "$SHA_FILE")" ) \
  || die 74 "la suma sha256 no coincide: el respaldo pudo corromperse o ser alterado"
[ "$(head -c 5 "$DUMP_FILE")" = "PGDMP" ] || die 74 "el archivo no tiene formato custom de pg_dump"
log "respaldo verificado: $(basename "$DUMP_FILE")"

# --- un solo proceso de restauración por respaldo a la vez ---------------------
exec 9>"$SHA_FILE.restore.lock" || die 73 "no se pudo crear el archivo de bloqueo junto al respaldo"
flock -n 9 || die 75 "ya hay otra restauración de este respaldo en curso"

# --- helpers de conexión --------------------------------------------------------
# PG_CONTAINER: los binarios corren DENTRO del contenedor (misma versión que el
# servidor); los datos viajan por stdin/stdout entre el host y el contenedor.
psql_cmd() { # dbname, sql -> stdout
  if [ -n "$PG_CONTAINER" ]; then
    docker exec -i ${PGPASSWORD:+-e PGPASSWORD} -e PGUSER "$PG_CONTAINER" \
      "${PSQL_BIN:-psql}" -v ON_ERROR_STOP=1 -q -U "$PGUSER" -d "$1" --no-password -Atc "$2"
  else
    "${PSQL_BIN:-psql}" -v ON_ERROR_STOP=1 -q -U "$PGUSER" -d "$1" --no-password -Atc "$2"
  fi
}
restore_cmd() { # dbname -> lee el .dump por stdin
  if [ -n "$PG_CONTAINER" ]; then
    docker exec -i ${PGPASSWORD:+-e PGPASSWORD} -e PGUSER "$PG_CONTAINER" \
      "${PG_RESTORE_BIN:-pg_restore}" --no-password --clean --if-exists --no-owner --exit-on-error \
      -U "$PGUSER" -d "$1"
  else
    "${PG_RESTORE_BIN:-pg_restore}" --no-password --clean --if-exists --no-owner --exit-on-error \
      -U "$PGUSER" -d "$1"
  fi
}

# --- elegir base destino --------------------------------------------------------
if [ "$SOBRE_PRODUCCION" -eq 1 ]; then
  [ -n "${PGDATABASE:-}" ] || die 64 "define PGDATABASE (la base productiva a restaurar)"
  TARGET_DB="$PGDATABASE"
  log "modo PRODUCCIÓN: se va a sobrescribir la base \"$TARGET_DB\""

  esperado="RESTAURAR SOBRE PRODUCCION ($TARGET_DB)"
  printf 'Para continuar escriba exactamente: %s\n> ' "$esperado" >&2
  respuesta=""
  IFS= read -r respuesta || true
  [ "$respuesta" = "$esperado" ] || die 64 "confirmación no coincide; no se restauró nada"

  log "respaldo de seguridad de \"$TARGET_DB\" antes de restaurar..."
  "$HERE/pg-backup.sh" ${ENV_FILE:+"$ENV_FILE"} || die "$?" "el respaldo de seguridad previo falló; no se restauró nada"
else
  TARGET_DB="uvg_collab_restore_$(date -u +%Y%m%dT%H%M%SZ)"
  log "modo prueba: se crea la base nueva \"$TARGET_DB\""
  psql_cmd "$PGADMINDB" "CREATE DATABASE \"$TARGET_DB\";" >/dev/null \
    || die 73 "no se pudo crear la base temporal \"$TARGET_DB\""
fi

# --- restauración ----------------------------------------------------------------
log "restaurando sobre \"$TARGET_DB\"..."
restore_cmd "$TARGET_DB" <"$DUMP_FILE" \
  || die 74 "pg_restore falló; revise el estado de \"$TARGET_DB\" antes de usarla"
log "ok: restauración completa en \"$TARGET_DB\""

# --- conteo de filas de las tablas principales ------------------------------------
printf '\n%-20s %s\n' "tabla" "filas"
for tabla in usuario proyecto tarea sprint notificacion actividad_proyecto; do
  n="$(psql_cmd "$TARGET_DB" "SELECT count(*) FROM $tabla;" 2>/dev/null || echo '?')"
  printf '%-20s %s\n' "$tabla" "$n"
done

if [ "$SOBRE_PRODUCCION" -ne 1 ]; then
  log "para borrar la base de prueba: dropdb -U \"$PGUSER\" \"$TARGET_DB\" (o DROP DATABASE \"$TARGET_DB\";)"
fi
