#!/usr/bin/env bash
# T-313 · prueba de pg-backup.sh contra un PostgreSQL REAL y DESECHABLE.
#
#   bash infra/db-backup/test/pg-backup-integration.sh
#
# Levanta su propio contenedor (datos en tmpfs, sin puertos publicados, nombre
# único), crea una base de prueba, la respalda con el script real y borra el
# contenedor al terminar. No se conecta a ninguna otra base: el único
# contenedor que toca es el que crea, y lo comprueba por su etiqueta antes de
# cada uso. No restaura ningún respaldo (eso es T-314).
#
# Requiere Docker. Imagen: PG_IMAGE (por defecto postgres:17-alpine, la misma
# versión que la base del proyecto).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT="$HERE/../pg-backup.sh"
VERIFY="$HERE/../verify-backup.sh"
IMAGE="${PG_IMAGE:-postgres:17-alpine}"
NAME="uvg-backup-it-$$-$(date +%s)"
LABEL="uvgenius.backup-integration=$NAME"
WORK="$(mktemp -d)"
fails=0
total=0

check() {
  total=$((total + 1))
  if [ "$2" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi
}
# Solo se actúa sobre el contenedor que esta prueba creó.
mine() { [ "$(docker ps -aq --filter "name=^${NAME}$" --filter "label=$LABEL" | wc -l)" -eq 1 ]; }
cleanup() {
  if mine; then docker rm -f "$NAME" >/dev/null 2>&1; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

command -v docker >/dev/null || { echo "pg-backup-integration: Docker no está disponible" >&2; exit 69; }

docker run -d --name "$NAME" --label "$LABEL" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=respaldo_it -e POSTGRES_DB=respaldo_it -e POSTGRES_PASSWORD="it-$RANDOM-$RANDOM" \
  "$IMAGE" >/dev/null || { echo "pg-backup-integration: no se pudo crear el contenedor" >&2; exit 69; }
mine || { echo "pg-backup-integration: el contenedor creado no se reconoce" >&2; exit 69; }

psql() { docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -q -U respaldo_it -d respaldo_it "$@"; }
# La imagen arranca un servidor temporal, lo detiene y arranca el definitivo.
# Ese servidor temporal solo escucha en el socket: por TCP responde únicamente el definitivo.
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -q -h 127.0.0.1 -U respaldo_it -d respaldo_it && break
  sleep 0.5
done
psql <<'SQL'
CREATE TABLE usuario (id serial PRIMARY KEY, nombre text NOT NULL);
CREATE TABLE proyecto (id serial PRIMARY KEY, titulo text NOT NULL, lider int REFERENCES usuario(id));
INSERT INTO usuario (nombre) SELECT 'persona sintética ' || g FROM generate_series(1, 500) g;
INSERT INTO proyecto (titulo, lider) SELECT 'proyecto sintético ' || g, g FROM generate_series(1, 200) g;
SQL
check "la base desechable tiene datos" "$([ "$(psql -Atc 'SELECT count(*) FROM usuario')" = 500 ]; echo $?)"

run() { # dir, [VAR=valor ...]
  local dir="$1"; shift
  env -i PATH="$PATH" HOME="$WORK" BACKUP_DIR="$dir" BACKUP_MIN_FREE_MB=1 \
    PG_CONTAINER="$NAME" PGDATABASE=respaldo_it PGUSER=respaldo_it "$@" bash "$SCRIPT" >"$WORK/out" 2>&1
  code=$?
}
dumps() { find "$1" -maxdepth 1 -type f -name '*.dump' 2>/dev/null | sort; }

# --- respaldo real -------------------------------------------------------------
D="$WORK/respaldos"
run "$D"
check "pg-backup.sh termina en 0 contra PostgreSQL real" "$code"
f="$(dumps "$D")"
check "crea un respaldo" "$([ -n "$f" ] && [ "$(printf '%s\n' "$f" | wc -l)" -eq 1 ]; echo $?)"
check "no está vacío" "$([ -s "$f" ]; echo $?)"
check "tiene la firma de formato custom (PGDMP)" "$([ "$(head -c 5 "$f")" = PGDMP ]; echo $?)"
check "permisos 600 en el respaldo y 700 en el directorio" "$([ "$(stat -c %a "$f")" = 600 ] && [ "$(stat -c %a "$D")" = 700 ]; echo $?)"
check "el respaldo quedó en el host, no dentro del contenedor" \
  "$(! docker exec "$NAME" sh -c 'find / -xdev -name "*.dump" 2>/dev/null | grep -q .'; echo $?)"
list="$(docker exec -i "$NAME" pg_restore --list <"$f")"
check "pg_restore --list reconoce el archivo" "$?"
for tabla in usuario proyecto; do
  check "contiene la definición de la tabla $tabla" "$(printf '%s\n' "$list" | grep -Eq " TABLE public $tabla "; echo $?)"
  check "contiene los datos de la tabla $tabla" "$(printf '%s\n' "$list" | grep -Eq " TABLE DATA public $tabla "; echo $?)"
done
check "contiene la clave foránea" "$(printf '%s\n' "$list" | grep -q 'FK CONSTRAINT'; echo $?)"
check "la suma sha256 valida" "$( (cd "$D" && sha256sum -c --status "$(basename "$f").sha256"); echo $?)"
env -i PATH="$PATH" HOME="$WORK" BACKUP_DIR="$D" PGDATABASE=respaldo_it bash "$VERIFY" >"$WORK/out" 2>&1
check "verify-backup.sh acepta el respaldo real" "$?"

# --- fallos reales -------------------------------------------------------------
D="$WORK/base-inexistente"
run "$D" PGDATABASE=no_existe
check "una base que no existe termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
check "y no deja ningún respaldo ni temporal" "$([ "$(find "$D" -type f ! -name '.pg-backup.lock' | wc -l)" -eq 0 ]; echo $?)"
D="$WORK/contenedor-inexistente"
run "$D" PG_CONTAINER="$NAME-no-existe"
check "un contenedor que no existe termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
check "y no deja ningún respaldo" "$([ -z "$(dumps "$D")" ]; echo $?)"

# --- rotación con un respaldo real ----------------------------------------------
D="$WORK/respaldos"
viejo="$D/uvgenius_respaldo_it_20260901T060000Z.dump"
cp "$f" "$viejo" && touch -d '9 days ago' "$viejo"
sleep 1 # la marca de tiempo del nombre tiene resolución de un segundo
run "$D"
check "un segundo respaldo real termina en 0" "$code"
check "elimina el respaldo de 9 días" "$([ ! -e "$viejo" ]; echo $?)"
check "conserva los dos respaldos recientes" "$([ "$(dumps "$D" | wc -l)" -eq 2 ]; echo $?)"

docker stop -t 2 "$NAME" >/dev/null 2>&1
viejo="$D/uvgenius_respaldo_it_20260902T060000Z.dump"
cp "$f" "$viejo" && touch -d '9 days ago' "$viejo"
sleep 1
run "$D"
check "con la base caída termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
check "y conserva todos los respaldos, también el vencido" "$([ -e "$viejo" ] && [ "$(dumps "$D" | wc -l)" -eq 3 ]; echo $?)"

echo "pg-backup-integration: $((total - fails))/$total (imagen $IMAGE)"
[ "$fails" -eq 0 ]
