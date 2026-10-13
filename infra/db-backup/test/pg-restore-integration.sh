#!/usr/bin/env bash
# T-314 · prueba de pg-restore.sh contra un PostgreSQL REAL y DESECHABLE.
#
#   bash infra/db-backup/test/pg-restore-integration.sh
#
# Levanta su propio contenedor (datos en tmpfs, sin puertos publicados, nombre
# único), crea una base con datos sintéticos, la respalda con pg-backup.sh,
# la restaura con pg-restore.sh en una base NUEVA, compara los conteos de
# filas contra el original y borra la base temporal y el contenedor al
# terminar. No toca ninguna otra base.
#
# Requiere Docker. Imagen: PG_IMAGE (por defecto postgres:17-alpine, la misma
# que pg-backup-integration.sh). No corre en CI: se ejecuta a mano.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BACKUP_SCRIPT="$HERE/../pg-backup.sh"
RESTORE_SCRIPT="$HERE/../pg-restore.sh"
IMAGE="${PG_IMAGE:-postgres:17-alpine}"
NAME="uvg-restore-it-$$-$(date +%s)"
LABEL="uvgenius.restore-integration=$NAME"
WORK="$(mktemp -d)"
TARGET_DB=""
fails=0
total=0

check() {
  total=$((total + 1))
  if [ "$2" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi
}
mine() { [ "$(docker ps -aq --filter "name=^${NAME}$" --filter "label=$LABEL" | wc -l)" -eq 1 ]; }
psql_it() { docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -q -U restauracion_it -d "$1" "${@:2}"; }
cleanup() {
  if [ -n "$TARGET_DB" ] && mine; then psql_it postgres -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" >/dev/null 2>&1; fi
  if mine; then docker rm -f "$NAME" >/dev/null 2>&1; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

command -v docker >/dev/null || { echo "pg-restore-integration: Docker no está disponible" >&2; exit 69; }

docker run -d --name "$NAME" --label "$LABEL" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=restauracion_it -e POSTGRES_DB=restauracion_it -e POSTGRES_PASSWORD="it-$RANDOM-$RANDOM" \
  "$IMAGE" >/dev/null || { echo "pg-restore-integration: no se pudo crear el contenedor" >&2; exit 69; }
mine || { echo "pg-restore-integration: el contenedor creado no se reconoce" >&2; exit 69; }

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -q -h 127.0.0.1 -U restauracion_it -d restauracion_it && break
  sleep 0.5
done
docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -q -U restauracion_it -d restauracion_it <<'SQL'
CREATE TABLE usuario (id serial PRIMARY KEY, nombre text NOT NULL);
CREATE TABLE proyecto (id serial PRIMARY KEY, titulo text NOT NULL, lider int REFERENCES usuario(id));
CREATE TABLE tarea (id serial PRIMARY KEY, titulo text NOT NULL, id_proyecto int REFERENCES proyecto(id));
CREATE TABLE sprint (id serial PRIMARY KEY, nombre text NOT NULL, id_proyecto int REFERENCES proyecto(id));
CREATE TABLE notificacion (id serial PRIMARY KEY, mensaje text NOT NULL, id_usuario int REFERENCES usuario(id));
CREATE TABLE actividad_proyecto (id serial PRIMARY KEY, titulo_actividad text NOT NULL, id_proyecto int REFERENCES proyecto(id));
INSERT INTO usuario (nombre) SELECT 'persona sintética ' || g FROM generate_series(1, 120) g;
INSERT INTO proyecto (titulo, lider) SELECT 'proyecto sintético ' || g, g FROM generate_series(1, 40) g;
INSERT INTO tarea (titulo, id_proyecto) SELECT 'tarea sintética ' || g, (g % 40) + 1 FROM generate_series(1, 300) g;
INSERT INTO sprint (nombre, id_proyecto) SELECT 'sprint sintético ' || g, (g % 40) + 1 FROM generate_series(1, 80) g;
INSERT INTO notificacion (mensaje, id_usuario) SELECT 'notificación sintética ' || g, (g % 120) + 1 FROM generate_series(1, 500) g;
INSERT INTO actividad_proyecto (titulo_actividad, id_proyecto) SELECT 'actividad sintética ' || g, (g % 40) + 1 FROM generate_series(1, 60) g;
SQL
check "la base desechable tiene datos" "$([ "$(psql_it restauracion_it -Atc 'SELECT count(*) FROM usuario')" = 120 ]; echo $?)"

# --- conteos originales ---------------------------------------------------------
declare -A original
for tabla in usuario proyecto tarea sprint notificacion actividad_proyecto; do
  original[$tabla]="$(psql_it restauracion_it -Atc "SELECT count(*) FROM $tabla;")"
done

# --- respaldo real con pg-backup.sh ---------------------------------------------
D="$WORK/respaldos"
env -i PATH="$PATH" HOME="$WORK" BACKUP_DIR="$D" BACKUP_MIN_FREE_MB=1 \
  PG_CONTAINER="$NAME" PGDATABASE=restauracion_it PGUSER=restauracion_it bash "$BACKUP_SCRIPT" >"$WORK/out-backup" 2>&1
check "pg-backup.sh termina en 0 contra la base sintética" "$?"
DUMP="$(find "$D" -maxdepth 1 -type f -name '*.dump' | head -n1)"
check "crea exactamente un respaldo" "$([ -n "$DUMP" ]; echo $?)"

# --- restauración de prueba con pg-restore.sh -----------------------------------
env -i PATH="$PATH" HOME="$WORK" PG_CONTAINER="$NAME" PGUSER=restauracion_it \
  bash "$RESTORE_SCRIPT" "$DUMP" >"$WORK/out-restore" 2>&1
check "pg-restore.sh termina en 0" "$?"
TARGET_DB="$(grep -oE 'restaurando sobre "[^"]+"' "$WORK/out-restore" | sed -E 's/.*"([^"]+)".*/\1/')"
check "crea una base nueva uvg_collab_restore_<marca>" "$(printf '%s' "$TARGET_DB" | grep -Eq '^uvg_collab_restore_[0-9]{8}T[0-9]{6}Z$'; echo $?)"
check "la salida imprime la tabla de conteos" "$(for t in usuario proyecto tarea sprint notificacion actividad_proyecto; do grep -q "^$t" "$WORK/out-restore" || exit 1; done; echo $?)"

# --- comparación de conteos contra el original ----------------------------------
for tabla in usuario proyecto tarea sprint notificacion actividad_proyecto; do
  restaurado="$(psql_it "$TARGET_DB" -Atc "SELECT count(*) FROM $tabla;" 2>/dev/null)"
  check "la tabla $tabla tiene el mismo número de filas (${original[$tabla]})" \
    "$([ "$restaurado" = "${original[$tabla]}" ]; echo $?)"
done

# --- falla si no hay .sha256 o si no coincide -----------------------------------
rm -f "$DUMP.sha256"
env -i PATH="$PATH" HOME="$WORK" PG_CONTAINER="$NAME" PGUSER=restauracion_it \
  bash "$RESTORE_SCRIPT" "$DUMP" >"$WORK/out-sin-sha" 2>&1
sin_sha_code=$?
check "sin .sha256 termina en 74 también contra PostgreSQL real" "$([ "$sin_sha_code" -eq 74 ]; echo $?)"

echo "pg-restore-integration: $((total - fails))/$total (imagen $IMAGE)"
[ "$fails" -eq 0 ]
