#!/usr/bin/env bash
# T-313 · contrato de infra/db-backup/pg-backup.sh con pg_dump y pg_restore
# simulados. No necesita PostgreSQL ni Docker: todo ocurre en un directorio
# temporal que se borra al terminar.
#
#   bash infra/db-backup/test/pg-backup-contract.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT="$HERE/../pg-backup.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SECRET='s3cr3to-de-prueba-no-real'
fails=0
total=0

check() { # descripción, condición ya evaluada (0 = ok)
  total=$((total + 1))
  if [ "$2" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi
}

# Binarios simulados. FAKE_DUMP decide qué hace pg_dump; ambos anotan sus argumentos.
mkdir -p "$WORK/bin"
cat >"$WORK/bin/pg_dump" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_LOG"
case "${FAKE_DUMP:-ok}" in
  ok) printf 'PGDMP\001\016\000contenido-de-prueba' ;;
  empty) : ;;
  plain) printf -- '-- PostgreSQL database dump\n' ;;
  fail) printf 'PGDMP\001parcial'; echo 'pg_dump: error: connection refused' >&2; exit 1 ;;
  slow) printf 'PGDMP\001\016\000lento'; sleep 3 ;;
esac
FAKE
cat >"$WORK/bin/pg_restore" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$FAKE_LOG"
cat >/dev/null
[ "${FAKE_RESTORE:-ok}" = ok ] || { echo 'pg_restore: error: input file does not appear to be a valid archive' >&2; exit 1; }
printf ';\n; Archive created at 2026-10-11\n;\n215; 1259 16385 TABLE public usuario app\n216; 1259 16390 TABLE public proyecto app\n'
FAKE
chmod +x "$WORK/bin/pg_dump" "$WORK/bin/pg_restore"

# Ejecuta el script en un entorno limpio; deja salida en $WORK/out y el código en $code.
run() { # dir, [VAR=valor ...]
  local dir="$1"; shift
  : >"$WORK/argv.log"
  env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv.log" \
    BACKUP_DIR="$dir" PGDATABASE=uvg_collab PGUSER=respaldo PGPASSWORD="$SECRET" BACKUP_MIN_FREE_MB=1 \
    "$@" bash "$SCRIPT" >"$WORK/out" 2>&1
  code=$?
}
dumps() { find "$1" -maxdepth 1 -type f -name '*.dump' 2>/dev/null | sort; }
count() { dumps "$1" | wc -l; }
leftovers() { find "$1" -maxdepth 1 -name '.*.tmp.*' 2>/dev/null | wc -l; }

# --- volcado correcto ---------------------------------------------------------
D="$WORK/ok"
run "$D"
check "un volcado correcto termina en 0" "$code"
check "crea exactamente un respaldo" "$([ "$(count "$D")" -eq 1 ]; echo $?)"
f="$(dumps "$D")"
check "el nombre lleva prefijo, base y marca de tiempo UTC" "$([[ "$(basename "$f")" =~ ^uvgenius_uvg_collab_[0-9]{8}T[0-9]{6}Z\.dump$ ]]; echo $?)"
check "el respaldo solo lo lee su dueño (600)" "$([ "$(stat -c %a "$f")" = 600 ]; echo $?)"
check "el directorio de respaldos es privado (700)" "$([ "$(stat -c %a "$D")" = 700 ]; echo $?)"
check "no queda ningún temporal" "$([ "$(leftovers "$D")" -eq 0 ]; echo $?)"
check "escribe una suma sha256 que valida" "$( (cd "$D" && sha256sum -c --status "$(basename "$f").sha256"); echo $?)"
check "pide formato custom y nunca pide la contraseña por terminal" "$(grep -q -- '--format=custom --no-password' "$WORK/argv.log"; echo $?)"
check "verifica el respaldo con pg_restore --list" "$(grep -q -- '--list' "$WORK/argv.log"; echo $?)"
check "la contraseña no aparece en la salida" "$(! grep -q "$SECRET" "$WORK/out"; echo $?)"
check "la contraseña no viaja en los argumentos de pg_dump ni de pg_restore" "$(! grep -q "$SECRET" "$WORK/argv.log"; echo $?)"
check "la salida informa el archivo creado" "$(grep -q "ok: $(basename "$f")" "$WORK/out"; echo $?)"

# --- un volcado fallido nunca parece un respaldo ------------------------------
for caso in fail empty plain; do
  D="$WORK/caso-$caso"
  run "$D" FAKE_DUMP="$caso"
  check "pg_dump '$caso' termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
  check "pg_dump '$caso' no deja ningún .dump" "$([ "$(count "$D")" -eq 0 ]; echo $?)"
  check "pg_dump '$caso' no deja temporales" "$([ "$(leftovers "$D")" -eq 0 ]; echo $?)"
done
D="$WORK/restore-falla"
run "$D" FAKE_RESTORE=fail
check "si pg_restore --list no reconoce el archivo termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
check "y no deja ningún .dump" "$([ "$(count "$D")" -eq 0 ]; echo $?)"

# --- configuración -----------------------------------------------------------
run "$WORK/sin-clave" PGPASSWORD=
check "sin PGPASSWORD ni PGPASSFILE termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
check "y no ejecuta pg_dump" "$([ ! -s "$WORK/argv.log" ]; echo $?)"
run "relativo/respaldos"
check "un BACKUP_DIR relativo termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
run "$WORK/prefijo" BACKUP_PREFIX='../otro'
check "un prefijo con caracteres de ruta termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
run "$WORK/base" PGDATABASE='uvg;rm -rf'
check "un nombre de base con caracteres de shell termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
run "$WORK/pgpass" PGPASSWORD= PGPASSFILE="$WORK/pgpass.conf"
check "PGPASSFILE basta como credencial" "$code"

# --- archivo de configuración ------------------------------------------------
cat >"$WORK/backup.env" <<ENV
BACKUP_DIR=$WORK/desde-env
PGDATABASE=uvg_collab
PGUSER=respaldo
PGPASSWORD=$SECRET
BACKUP_MIN_FREE_MB=1
ENV
chmod 644 "$WORK/backup.env"
env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv.log" bash "$SCRIPT" "$WORK/backup.env" >"$WORK/out" 2>&1
check "un archivo de configuración legible por otros termina en 64" "$([ $? -eq 64 ]; echo $?)"
check "y no llega a crear el directorio de respaldos" "$([ ! -e "$WORK/desde-env" ]; echo $?)"
chmod 600 "$WORK/backup.env"
env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv.log" bash "$SCRIPT" "$WORK/backup.env" >"$WORK/out" 2>&1
check "con permisos 600 el archivo de configuración funciona" "$?"
check "y crea su respaldo" "$([ "$(count "$WORK/desde-env")" -eq 1 ]; echo $?)"
check "la contraseña del archivo tampoco aparece en la salida" "$(! grep -q "$SECRET" "$WORK/out"; echo $?)"

# --- destino -----------------------------------------------------------------
git init -q "$WORK/repo" 2>/dev/null
run "$WORK/repo/respaldos"
check "un BACKUP_DIR dentro de un repositorio Git termina en 73" "$([ "$code" -eq 73 ]; echo $?)"
check "y no escribe ningún respaldo en el repositorio" "$([ "$(count "$WORK/repo/respaldos")" -eq 0 ]; echo $?)"
run "$WORK/sin-espacio" BACKUP_MIN_FREE_MB=999999999
check "sin el espacio libre mínimo termina en 73" "$([ "$code" -eq 73 ]; echo $?)"
check "y no ejecuta pg_dump" "$([ ! -s "$WORK/argv.log" ]; echo $?)"

# --- concurrencia ------------------------------------------------------------
D="$WORK/concurrente"
env -i PATH="$WORK/bin:$PATH" HOME="$WORK" FAKE_LOG="$WORK/argv-lento.log" FAKE_DUMP=slow \
  BACKUP_DIR="$D" PGDATABASE=uvg_collab PGUSER=respaldo PGPASSWORD="$SECRET" BACKUP_MIN_FREE_MB=1 \
  bash "$SCRIPT" >"$WORK/out-lento" 2>&1 &
lento=$!
for _ in $(seq 1 50); do [ -e "$D/.pg-backup.lock" ] && break; sleep 0.1; done
sleep 0.3
run "$D"
check "un segundo respaldo simultáneo termina en 75" "$([ "$code" -eq 75 ]; echo $?)"
wait "$lento"
check "el primero termina bien" "$?"
check "y solo existe un respaldo" "$([ "$(count "$D")" -eq 1 ]; echo $?)"

echo "pg-backup-contract: $((total - fails))/$total"
[ "$fails" -eq 0 ]
