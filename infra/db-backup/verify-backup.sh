#!/usr/bin/env bash
# T-313 · comprueba que existe un respaldo reciente e íntegro.
#
#   infra/db-backup/verify-backup.sh [archivo.env]
#
# Pensado para el cron de vigilancia: termina con 1 si el último respaldo
# falta, es más viejo que BACKUP_MAX_AGE_HOURS (26 por defecto: un día más un
# margen), está vacío, no tiene la firma de pg_dump o no coincide con su suma
# sha256. No se conecta a la base ni restaura nada.
#
# Códigos de salida: 0 ok · 1 respaldo ausente, viejo o dañado · 64 configuración.
set -euo pipefail

log() { printf '%s verify-backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { local code="$1"; shift; log "ERROR: $*" >&2; exit "$code"; }

ENV_FILE="${1:-${BACKUP_ENV_FILE:-}}"
if [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || die 64 "no existe el archivo de configuración"
  perms="$(stat -c '%a' "$ENV_FILE")"
  case "$perms" in 600 | 400) ;; *) die 64 "el archivo de configuración debe tener permisos 600 o 400 (tiene $perms)" ;; esac
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${BACKUP_DIR:?define BACKUP_DIR}"
BACKUP_PREFIX="${BACKUP_PREFIX:-uvgenius}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
PGDATABASE="${PGDATABASE:-}"
[ -n "$PGDATABASE" ] || die 64 "define PGDATABASE"
case "$BACKUP_PREFIX" in '' | *[!A-Za-z0-9-]*) die 64 "BACKUP_PREFIX solo admite letras, números y guiones" ;; esac
case "$PGDATABASE" in *[!A-Za-z0-9_-]*) die 64 "PGDATABASE solo admite letras, números, guiones y guiones bajos" ;; esac
case "$BACKUP_MAX_AGE_HOURS" in '' | 0 | *[!0-9]*) die 64 "BACKUP_MAX_AGE_HOURS debe ser un número entero mayor que 0" ;; esac
[ -d "$BACKUP_DIR" ] || die 1 "no existe BACKUP_DIR: nunca se ha hecho un respaldo"

# La marca de tiempo del nombre es UTC y de ancho fijo: el orden alfabético es el cronológico.
own="${BACKUP_PREFIX}_${PGDATABASE}_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.dump"
latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$own" | sort | tail -n 1)"
[ -n "$latest" ] || die 1 "no hay ningún respaldo de ${PGDATABASE}"
name="$(basename "$latest")"

age_min="$(( ($(date +%s) - $(stat -c %Y "$latest")) / 60 ))"
[ "$age_min" -le "$((BACKUP_MAX_AGE_HOURS * 60))" ] ||
  die 1 "el último respaldo (${name}) tiene $((age_min / 60)) h; el máximo es ${BACKUP_MAX_AGE_HOURS} h"
[ -s "$latest" ] || die 1 "el último respaldo (${name}) está vacío"
[ "$(head -c 5 "$latest")" = "PGDMP" ] || die 1 "el último respaldo (${name}) no tiene formato custom de pg_dump"
[ -f "$latest.sha256" ] || die 1 "falta la suma sha256 de ${name}"
( cd "$BACKUP_DIR" && sha256sum -c --status "$name.sha256" ) || die 1 "la suma sha256 de ${name} no coincide: el archivo cambió o está dañado"

log "ok: ${name} ($((age_min / 60)) h, $(du -k "$latest" | cut -f1) KB, sha256 válida)"
