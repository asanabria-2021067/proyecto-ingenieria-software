#!/usr/bin/env bash
# T-314 · contrato de infra/db-backup/pg-restore.sh con psql, pg_dump y
# pg_restore simulados. No necesita PostgreSQL ni Docker: todo ocurre en un
# directorio temporal que se borra al terminar.
#
#   bash infra/db-backup/test/pg-restore-contract.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT="$HERE/../pg-restore.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SECRET='s3cr3to-de-prueba-no-real'
fails=0
total=0

check() { # descripción, condición ya evaluada (0 = ok)
  total=$((total + 1))
  if [ "$2" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi
}

# --- binarios simulados --------------------------------------------------------
mkdir -p "$WORK/bin"
cat >"$WORK/bin/pg_dump" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_LOG"
case "${FAKE_DUMP:-ok}" in
  ok) printf 'PGDMP\001\016\000contenido-de-seguridad' ;;
  fail) echo 'pg_dump: error: connection refused' >&2; exit 1 ;;
esac
FAKE
cat >"$WORK/bin/psql" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_LOG"
db="" sql="" prev=""
for a in "$@"; do
  case "$prev" in -d) db="$a" ;; esac
  case "$a" in -Atc) next_is_sql=1 ;; *) [ "${next_is_sql:-0}" = 1 ] && sql="$a" && next_is_sql=0 ;; esac
  prev="$a"
done
case "$sql" in
  "CREATE DATABASE"*)
    [ "${FAKE_CREATEDB:-ok}" = ok ] || { echo 'psql: error: no se pudo crear la base' >&2; exit 1; }
    ;;
  "SELECT count(*)"*)
    printf '%s\n' "${FAKE_ROWCOUNT:-3}"
    ;;
esac
FAKE
cat >"$WORK/bin/pg_restore" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_LOG"
cat >/dev/null
case "${FAKE_RESTORE:-ok}" in
  ok) ;;
  fail) echo 'pg_restore: error: restauración falló' >&2; exit 1 ;;
  slow) sleep 2 ;;
esac
case "$*" in
  *--list*) printf ';\n; Archive created at 2026-10-11\n;\n215; 1259 16385 TABLE public usuario app\n' ;;
esac
FAKE
chmod +x "$WORK/bin/pg_dump" "$WORK/bin/psql" "$WORK/bin/pg_restore"

# --- respaldo de prueba, válido --------------------------------------------------
mkdir -p "$WORK/dumps"
DUMP="$WORK/dumps/uvgenius_uvg_collab_20260901T060000Z.dump"
printf 'PGDMP\001\016\000contenido-de-prueba' >"$DUMP"
( cd "$(dirname "$DUMP")" && sha256sum "$(basename "$DUMP")" >"$(basename "$DUMP").sha256" )

run() { # dump, [VAR=valor ...]
  local dump="$1"; shift
  : >"$WORK/argv.log"
  env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv.log" PGUSER=respaldo PGPASSWORD="$SECRET" \
    "$@" bash "$SCRIPT" "$dump" >"$WORK/out" 2>&1
  code=$?
}
run_prod() { # dump, confirmacion, [VAR=valor ...]
  local dump="$1" confirm="$2"; shift 2
  : >"$WORK/argv.log"
  printf '%s\n' "$confirm" | env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv.log" PGUSER=respaldo PGPASSWORD="$SECRET" \
    "$@" bash "$SCRIPT" "$dump" --sobre-produccion >"$WORK/out" 2>&1
  code=$?
}

# --- restauración de prueba correcta --------------------------------------------
run "$DUMP"
check "una restauración de prueba termina en 0" "$code"
check "crea una base nueva uvg_collab_restore_<marca>" \
  "$(grep -q 'CREATE DATABASE' "$WORK/argv.log" && grep -Eq 'uvg_collab_restore_[0-9]{8}T[0-9]{6}Z' "$WORK/argv.log"; echo $?)"
check "restaura con --clean --if-exists --no-owner --exit-on-error" \
  "$(grep -q -- '--clean --if-exists --no-owner --exit-on-error' "$WORK/argv.log"; echo $?)"
check "nunca pide la contraseña por terminal (--no-password)" "$(grep -q -- '--no-password' "$WORK/argv.log"; echo $?)"
check "la contraseña no aparece en la salida" "$(! grep -q "$SECRET" "$WORK/out"; echo $?)"
check "la contraseña no viaja en los argumentos" "$(! grep -q "$SECRET" "$WORK/argv.log"; echo $?)"
check "imprime el conteo de las seis tablas principales" \
  "$(for t in usuario proyecto tarea sprint notificacion actividad_proyecto; do grep -q "^$t" "$WORK/out" || exit 1; done; echo $?)"
check "nunca llama a pg_restore con --sobre-produccion sin pedirlo" "$(! grep -q 'sobre-produccion' "$WORK/out"; echo $?)"

# --- verificación del respaldo ---------------------------------------------------
SINSHA="$WORK/sin-sha/uvgenius_x_20260101T000000Z.dump"
mkdir -p "$(dirname "$SINSHA")"
cp "$DUMP" "$SINSHA"
run "$SINSHA"
check "sin archivo .sha256 termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
check "y no ejecuta psql ni pg_restore" "$([ ! -s "$WORK/argv.log" ]; echo $?)"

CORRUPTO="$WORK/corrupto/uvgenius_x_20260102T000000Z.dump"
mkdir -p "$(dirname "$CORRUPTO")"
cp "$DUMP" "$CORRUPTO"
( cd "$(dirname "$CORRUPTO")" && sha256sum "$(basename "$CORRUPTO")" >"$(basename "$CORRUPTO").sha256" )
printf 'dañado' >>"$CORRUPTO"
run "$CORRUPTO"
check "una suma sha256 que no coincide termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
check "y no ejecuta nada" "$([ ! -s "$WORK/argv.log" ]; echo $?)"

NOFIRMA="$WORK/sin-firma/uvgenius_x_20260103T000000Z.dump"
mkdir -p "$(dirname "$NOFIRMA")"
printf 'esto no es un volcado de pg_dump' >"$NOFIRMA"
( cd "$(dirname "$NOFIRMA")" && sha256sum "$(basename "$NOFIRMA")" >"$(basename "$NOFIRMA").sha256" )
run "$NOFIRMA"
check "un archivo sin firma PGDMP (aunque su suma coincida) termina en 74" "$([ "$code" -eq 74 ]; echo $?)"

# --- configuración ---------------------------------------------------------------
run "$DUMP" PGUSER=
check "sin PGUSER termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
run "$DUMP" PGPASSWORD=
check "sin PGPASSWORD ni PGPASSFILE termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
run "$DUMP" PGPASSWORD= PGPASSFILE="$WORK/pgpass.conf"
check "PGPASSFILE basta como credencial" "$code"
run "$DUMP" PG_CONTAINER=contenedor-inexistente PGPASSWORD=
check "PG_CONTAINER permite omitir la contraseña (no falla por configuración)" "$([ "$code" -ne 64 ]; echo $?)"

# --- fallo en pg_restore ----------------------------------------------------------
run "$DUMP" FAKE_RESTORE=fail
check "si pg_restore falla termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
run "$DUMP" FAKE_CREATEDB=fail
check "si no se puede crear la base temporal termina en 73" "$([ "$code" -eq 73 ]; echo $?)"

# --- modo producción --------------------------------------------------------------
: >"$WORK/argv.log"
env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv.log" PGUSER=respaldo PGPASSWORD="$SECRET" \
  bash "$SCRIPT" "$DUMP" --sobre-produccion >"$WORK/out" 2>&1 </dev/null
code=$?
check "--sobre-produccion sin PGDATABASE termina en 64" "$([ "$code" -eq 64 ]; echo $?)"

run_prod "$DUMP" "" PGDATABASE=uvg_collab
check "--sobre-produccion sin confirmación termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
check "y no llama a pg_dump ni a pg_restore" "$([ ! -s "$WORK/argv.log" ]; echo $?)"

run_prod "$DUMP" "si, adelante" PGDATABASE=uvg_collab
check "una confirmación que no coincide exactamente termina en 64" "$([ "$code" -eq 64 ]; echo $?)"

run_prod "$DUMP" "RESTAURAR SOBRE PRODUCCION (uvg_collab)" PGDATABASE=uvg_collab BACKUP_DIR="$WORK/respaldo-seguridad" BACKUP_MIN_FREE_MB=1
check "con la confirmación exacta y PGDATABASE, termina en 0" "$code"
check "hace primero un respaldo de seguridad con pg-backup.sh" "$(grep -c -- '--format=custom' "$WORK/argv.log" | grep -qx 1; echo $?)"
check "restaura sobre la base productiva indicada, no una base nueva" "$(! grep -q 'uvg_collab_restore_' "$WORK/argv.log"; echo $?)"
check "no sugiere borrar nada al restaurar sobre producción" "$(! grep -q 'para borrar la base de prueba' "$WORK/out"; echo $?)"

run_prod "$DUMP" "RESTAURAR SOBRE PRODUCCION (uvg_collab)" PGDATABASE=uvg_collab BACKUP_DIR="$WORK/respaldo-seguridad-falla" BACKUP_MIN_FREE_MB=1 FAKE_DUMP=fail
check "si el respaldo de seguridad previo falla, no se restaura nada" "$([ "$code" -eq 74 ] && ! grep -q -- '--clean' "$WORK/argv.log"; echo $?)"

# --- concurrencia ------------------------------------------------------------------
D2="$WORK/dumps2"
mkdir -p "$D2"
DUMP2="$D2/uvgenius_uvg_collab_20260905T060000Z.dump"
cp "$DUMP" "$DUMP2"
( cd "$D2" && sha256sum "$(basename "$DUMP2")" >"$(basename "$DUMP2").sha256" )
env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv-lento.log" PGUSER=respaldo PGPASSWORD="$SECRET" FAKE_RESTORE=slow \
  bash "$SCRIPT" "$DUMP2" >"$WORK/out-lento" 2>&1 &
lento=$!
for _ in $(seq 1 50); do [ -e "$DUMP2.sha256.restore.lock" ] && break; sleep 0.1; done
sleep 0.3
run "$DUMP2"
check "una segunda restauración simultánea del mismo respaldo termina en 75" "$([ "$code" -eq 75 ]; echo $?)"
wait "$lento"
check "la primera termina bien" "$?"

for sh in "$SCRIPT"; do
  check "$(basename "$sh") es sintácticamente válido y ejecutable" "$(bash -n "$sh" && [ -x "$sh" ]; echo $?)"
done

echo "pg-restore-contract: $((total - fails))/$total"
[ "$fails" -eq 0 ]
