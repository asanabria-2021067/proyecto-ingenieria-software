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

# --- rotación ----------------------------------------------------------------
# Siembra respaldos con fecha de modificación antigua: propios, ajenos y parecidos.
seed() { # dir
  mkdir -p "$1"
  old() { printf 'x' >"$1/$2"; touch -d "$3" "$1/$2"; }
  old "$1" uvgenius_uvg_collab_20260901T060000Z.dump '9 days ago'
  old "$1" uvgenius_uvg_collab_20260901T060000Z.dump.sha256 '9 days ago'
  old "$1" uvgenius_uvg_collab_20260905T060000Z.dump '6 days ago'
  old "$1" uvgenius_otra_base_20260901T060000Z.dump '9 days ago'
  old "$1" otroprefijo_uvg_collab_20260901T060000Z.dump '9 days ago'
  old "$1" uvgenius_uvg_collab_manual.dump '9 days ago'
  old "$1" notas.txt '9 days ago'
  old "$1" .uvgenius_uvg_collab_20260901T060000Z.dump.tmp.123 '9 days ago'
}
D="$WORK/rotacion"
seed "$D"
run "$D"
check "la rotación no altera el código de salida" "$code"
check "borra el respaldo propio de más de 7 días" "$([ ! -e "$D/uvgenius_uvg_collab_20260901T060000Z.dump" ]; echo $?)"
check "y su suma sha256" "$([ ! -e "$D/uvgenius_uvg_collab_20260901T060000Z.dump.sha256" ]; echo $?)"
check "conserva el respaldo propio de 6 días" "$([ -e "$D/uvgenius_uvg_collab_20260905T060000Z.dump" ]; echo $?)"
check "conserva el respaldo recién creado" "$([ "$(find "$D" -name 'uvgenius_uvg_collab_*Z.dump' -mmin -5 | wc -l)" -eq 1 ]; echo $?)"
check "no toca respaldos de otra base" "$([ -e "$D/uvgenius_otra_base_20260901T060000Z.dump" ]; echo $?)"
check "no toca respaldos con otro prefijo" "$([ -e "$D/otroprefijo_uvg_collab_20260901T060000Z.dump" ]; echo $?)"
check "no toca un .dump que no sigue el nombre del script" "$([ -e "$D/uvgenius_uvg_collab_manual.dump" ]; echo $?)"
check "no toca archivos ajenos" "$([ -e "$D/notas.txt" ]; echo $?)"
check "limpia el temporal huérfano de una ejecución muerta" "$([ "$(leftovers "$D")" -eq 0 ]; echo $?)"
check "informa cuántos respaldos eliminó" "$(grep -q 'rotación: 1 respaldo' "$WORK/out"; echo $?)"

D="$WORK/rotacion-falla"
seed "$D"
run "$D" FAKE_DUMP=fail
check "si el volcado falla termina en 74" "$([ "$code" -eq 74 ]; echo $?)"
check "y no borra el respaldo antiguo: sigue siendo el último válido" "$([ -e "$D/uvgenius_uvg_collab_20260901T060000Z.dump" ]; echo $?)"
D="$WORK/rotacion-verificacion-falla"
seed "$D"
run "$D" FAKE_RESTORE=fail
check "si la verificación falla tampoco borra nada" "$([ -e "$D/uvgenius_uvg_collab_20260901T060000Z.dump" ]; echo $?)"

D="$WORK/rotacion-30"
seed "$D"
run "$D" BACKUP_RETENTION_DAYS=30
check "con retención de 30 días conserva el respaldo de 9 días" "$([ -e "$D/uvgenius_uvg_collab_20260901T060000Z.dump" ]; echo $?)"
for malo in 0 -1 siete ''; do
  D="$WORK/retencion-$malo-x"
  seed "$D"
  run "$D" BACKUP_RETENTION_DAYS="$malo"
  if [ -z "$malo" ]; then
    check "una retención vacía usa los 7 días por defecto" "$code"
  else
    check "una retención '$malo' termina en 64" "$([ "$code" -eq 64 ]; echo $?)"
    check "y no borra nada" "$([ -e "$D/uvgenius_uvg_collab_20260901T060000Z.dump" ]; echo $?)"
  fi
done

# --- verify-backup.sh ----------------------------------------------------------
VERIFY="$HERE/../verify-backup.sh"
verify() { # dir, [VAR=valor ...]
  local dir="$1"; shift
  env -i PATH="$PATH" HOME="$WORK" BACKUP_DIR="$dir" PGDATABASE=uvg_collab "$@" bash "$VERIFY" >"$WORK/out" 2>&1
  code=$?
}
D="$WORK/vigilancia"
run "$D"
f="$(dumps "$D")"
verify "$D"
check "verify: un respaldo recién hecho pasa" "$code"
check "verify: nombra el respaldo comprobado" "$(grep -q "ok: $(basename "$f")" "$WORK/out"; echo $?)"
verify "$D" PGDATABASE=otra_base
check "verify: sin respaldos de esa base termina en 1" "$([ "$code" -eq 1 ]; echo $?)"
verify "$WORK/no-existe"
check "verify: sin directorio de respaldos termina en 1" "$([ "$code" -eq 1 ]; echo $?)"
touch -d '27 hours ago' "$f"
verify "$D"
check "verify: un respaldo de 27 horas termina en 1" "$([ "$code" -eq 1 ]; echo $?)"
verify "$D" BACKUP_MAX_AGE_HOURS=48
check "verify: el máximo de antigüedad es configurable" "$code"
touch "$f"
printf 'dañado' >>"$f"
verify "$D"
check "verify: un respaldo modificado tras crearse termina en 1" "$([ "$code" -eq 1 ]; echo $?)"
rm -f "$f.sha256"
verify "$D"
check "verify: sin suma sha256 termina en 1" "$([ "$code" -eq 1 ]; echo $?)"
printf 'no es un volcado' >"$f"
verify "$D"
check "verify: un archivo sin firma de pg_dump termina en 1" "$([ "$code" -eq 1 ]; echo $?)"
: >"$f"
verify "$D"
check "verify: un respaldo vacío termina en 1" "$([ "$code" -eq 1 ]; echo $?)"
verify "$D" BACKUP_MAX_AGE_HOURS=pronto
check "verify: una antigüedad no numérica termina en 64" "$([ "$code" -eq 64 ]; echo $?)"

# --- plantilla de cron ---------------------------------------------------------
CRON="$HERE/../pg-backup.cron.example"
jobs="$(grep -Ev '^[[:space:]]*(#|$)|^[A-Z_]+=' "$CRON")"
check "cron: dos tareas (respaldo y vigilancia)" "$([ "$(printf '%s\n' "$jobs" | wc -l)" -eq 2 ]; echo $?)"
# minuto hora día mes día-semana usuario comando
check "cron: cada tarea tiene cinco campos de horario, usuario y comando" \
  "$(! printf '%s\n' "$jobs" | grep -Evq '^[0-9]{1,2} [0-9]{1,2} \* \* \* [a-z_][a-z0-9_-]* /[^ ]+\.sh /[^ ]+ '; echo $?)"
check "cron: el respaldo es diario, una vez" "$(printf '%s\n' "$jobs" | grep -c 'pg-backup\.sh' | grep -qx 1; echo $?)"
check "cron: la vigilancia corre después del respaldo" "$(printf '%s\n' "$jobs" | awk '{print $2*60+$1}' | sort -nc 2>/dev/null; echo $?)"
check "cron: cada tarea avisa si falla" "$([ "$(printf '%s\n' "$jobs" | grep -c '|| logger ')" -eq 2 ]; echo $?)"
check "cron: no lleva credenciales" "$(! grep -Eiq 'PGPASSWORD|password|postgres(ql)?://' "$CRON"; echo $?)"
check "cron: documenta la hora de Guatemala" "$(grep -q 'Guatemala' "$CRON"; echo $?)"
for sh in "$SCRIPT" "$VERIFY"; do
  check "$(basename "$sh") es sintácticamente válido y ejecutable" "$(bash -n "$sh" && [ -x "$sh" ]; echo $?)"
done

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
