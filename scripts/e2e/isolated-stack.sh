#!/usr/bin/env bash
# GPI01-C12: pila E2E efimera y aislada (PostgreSQL 17 + Redis 7 en tmpfs,
# backend y frontend del HEAD en puertos propios). Nunca toca la base de
# desarrollo: cada paso que escribe pasa antes por `guard`, que falla cerrado.
#
#   scripts/e2e/isolated-stack.sh up        crea Postgres y Redis desechables
#   scripts/e2e/isolated-stack.sh migrate   guard + migrate deploy + seed (la base de integracion, sin seed)
#   scripts/e2e/isolated-stack.sh apps      guard + compila y arranca backend/frontend
#   scripts/e2e/isolated-stack.sh backend   guard + recompila y reinicia solo el backend
#   scripts/e2e/isolated-stack.sh frontend  guard + recompila y reinicia solo el frontend
#   scripts/e2e/isolated-stack.sh guard     solo las comprobaciones
#   scripts/e2e/isolated-stack.sh verify    guard + schema valido, sin migraciones pendientes ni deriva
#   scripts/e2e/isolated-stack.sh integration [args]  guard + suites de integracion del backend
#   scripts/e2e/isolated-stack.sh e2e [args]          guard + Playwright contra la pila
#   scripts/e2e/isolated-stack.sh env       imprime el entorno para Vitest/Playwright
#   scripts/e2e/isolated-stack.sh status    estado de contenedores y procesos
#   scripts/e2e/isolated-stack.sh down      destruye SOLO lo creado por este script
#
# Todos los secretos son sinteticos y viven solo en este archivo.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
RUN_DIR="${E2E_RUN_DIR:-${TMPDIR:-/tmp}/uvg-e2e-isolated}"

DB_CONTAINER=uvg-e2e-isolated-db
REDIS_CONTAINER=uvg-e2e-isolated-redis
LABEL=uvg.e2e.isolated=1
DB_PORT="${E2E_DB_PORT:-55432}"
REDIS_PORT="${E2E_REDIS_PORT:-56379}"
BACKEND_PORT="${E2E_BACKEND_PORT:-3101}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-3100}"
DB_NAME=uvg_e2e_isolated
# Base aparte para las suites de integracion del backend: migrada y SIN seed.
# Esas suites crean y borran sus propios datos (incluidas asignaciones de rol)
# y dan por hecho una base sin sembrar; en la base de los E2E dejarian a las
# cuentas sembradas sin rol.
DB_NAME_IT=uvg_e2e_isolated_it
DB_USER=e2e
DB_PASSWORD=e2e-isolated-synthetic
PGDATA_PATH=/var/lib/postgresql/data

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}?schema=public"
export DIRECT_URL="$DATABASE_URL"
IT_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME_IT}?schema=public"

fail() { echo "isolated-stack: ABORTA: $*" >&2; exit 1; }

# Entorno completo de las aplicaciones. Se fija TODO lo sensible para que
# ningun .env local (base de desarrollo, Cloudinary, llaves de cierre) llegue
# a los procesos efimeros: dotenv no pisa variables ya definidas.
app_env() {
  cat <<ENV
NODE_ENV=production
COOKIE_SECURE=false
PORT=${BACKEND_PORT}
DATABASE_URL=${DATABASE_URL}
DIRECT_URL=${DIRECT_URL}
INTEGRATION_DATABASE_URL=${IT_DATABASE_URL}
ROLES_IT_DATABASE_URL=${IT_DATABASE_URL}
RUN_REAL_DB_TESTS=1
JWT_SECRET=e2e-isolated-synthetic-jwt-secret-not-for-production
JWT_REFRESH_SECRET=e2e-isolated-synthetic-refresh-secret-not-for-production
REDIS_HOST=127.0.0.1
REDIS_PORT=${REDIS_PORT}
FRONTEND_URL=http://localhost:${FRONTEND_PORT}
NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}
NEXT_PUBLIC_API_PREFIX=/api
API_URL_INTERNAL=http://localhost:${BACKEND_PORT}
PLAYWRIGHT_BASE_URL=http://localhost:${FRONTEND_PORT}
E2E_API_URL=http://localhost:${BACKEND_PORT}
CLOUDINARY_CLOUD_NAME=e2e-isolated
CLOUDINARY_API_KEY=e2e-isolated
CLOUDINARY_API_SECRET=e2e-isolated
CLOUDINARY_URL=
CLOSURE_KEKS=
CLOSURE_ACTIVE_KEY_ID=
CLOSURE_TICKET_HMAC_SECRET=
NEXT_TELEMETRY_DISABLED=1
ENV
}

load_app_env() { set -a; eval "$(app_env)"; set +a; }

# Falla cerrado: la URL y el contenedor deben ser exactamente los desechables.
guard() {
  node "$REPO/scripts/e2e/assert-isolated-database.mjs" "$DATABASE_URL" "$DB_PORT" "$DB_NAME" \
    || fail "la URL de base no es la desechable"
  node "$REPO/scripts/e2e/assert-isolated-database.mjs" "$IT_DATABASE_URL" "$DB_PORT" "$DB_NAME_IT" \
    || fail "la URL de la base de integracion no es la desechable"
  docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || fail "no existe $DB_CONTAINER (ejecuta 'up')"
  [ "$(docker inspect -f '{{index .Config.Labels "uvg.e2e.isolated"}}' "$DB_CONTAINER")" = "1" ] \
    || fail "$DB_CONTAINER no lleva la etiqueta de este script"
  docker inspect -f '{{json .HostConfig.Tmpfs}}' "$DB_CONTAINER" | grep -q "\"$PGDATA_PATH\"" \
    || fail "$DB_CONTAINER no guarda sus datos en tmpfs"
  [ -z "$(docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}' "$DB_CONTAINER")" ] \
    || fail "$DB_CONTAINER monta un volumen: no es desechable"
  local published
  published="$(docker port "$DB_CONTAINER" 5432/tcp | head -1)"
  [ "$published" = "127.0.0.1:${DB_PORT}" ] || fail "puerto publicado inesperado: $published"
  # Ningun otro contenedor puede estar publicando ese puerto.
  local owners
  owners="$(docker ps --filter "publish=${DB_PORT}" --format '{{.Names}}' | tr '\n' ' ')"
  [ "$owners" = "$DB_CONTAINER " ] || fail "el puerto ${DB_PORT} lo publica: $owners"
  local seen
  seen="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc 'select current_database()')"
  [ "$seen" = "$DB_NAME" ] || fail "la base conectada es '$seen'"
  echo "isolated-stack: guard OK ($DB_CONTAINER, tmpfs, 127.0.0.1:${DB_PORT}/${DB_NAME})"
}

wait_http() { # url, segundos
  local i; for ((i = 0; i < $2; i++)); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done; return 1
}

cmd_up() {
  docker inspect "$DB_CONTAINER" >/dev/null 2>&1 && fail "$DB_CONTAINER ya existe (ejecuta 'down')"
  docker run -d --name "$DB_CONTAINER" --label "$LABEL" \
    --tmpfs "$PGDATA_PATH:rw,size=1g" -p "127.0.0.1:${DB_PORT}:5432" \
    -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
    postgres:17-alpine >/dev/null
  docker run -d --name "$REDIS_CONTAINER" --label "$LABEL" --tmpfs /data \
    -p "127.0.0.1:${REDIS_PORT}:6379" redis:7-alpine redis-server --save '' --appendonly no >/dev/null
  local i
  for ((i = 0; i < 60; i++)); do
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1
  done
  docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$DB_NAME_IT"
  guard
}

cmd_migrate() {
  guard
  load_app_env
  (cd "$REPO/apps/backend" && npx prisma migrate deploy && npx prisma db seed)
  # La base de integracion recibe las mismas migraciones y ningun seed.
  (cd "$REPO/apps/backend" && DATABASE_URL="$IT_DATABASE_URL" DIRECT_URL="$IT_DATABASE_URL" npx prisma migrate deploy)
  guard
}

stop_app() { # backend | frontend: termina lo que escucha en el puerto propio de esa aplicacion
  local port="$BACKEND_PORT"; [ "$1" = frontend ] && port="$FRONTEND_PORT"
  fuser -k -TERM "${port}/tcp" >/dev/null 2>&1 || true
  local i; for ((i = 0; i < 20; i++)); do fuser "${port}/tcp" >/dev/null 2>&1 || break; sleep 1; done
}

port_free() { ! curl -s -o /dev/null "http://localhost:$1" || fail "el puerto $1 ya esta en uso"; }

start_backend() {
  stop_app backend
  port_free "$BACKEND_PORT"
  (cd "$REPO/apps/backend" && npx prisma generate >/dev/null && npm run build >"$RUN_DIR/backend-build.log" 2>&1)
  # `exec` dentro del subshell: no queda un bash intermedio reteniendo la salida de quien invoca.
  (cd "$REPO/apps/backend" && exec nohup node dist/main >"$RUN_DIR/backend.log" 2>&1 </dev/null) &
  wait_http "http://localhost:${BACKEND_PORT}/api" 60 || fail "el backend efimero no responde"
}

start_frontend() {
  stop_app frontend
  port_free "$FRONTEND_PORT"
  (cd "$REPO/apps/frontend" && npm run build >"$RUN_DIR/frontend-build.log" 2>&1) || fail "next build fallo (ver frontend-build.log)"
  # El bundle no puede apuntar al backend de desarrollo.
  if grep -rqE "localhost:3001|127\.0\.0\.1:3001" "$REPO/apps/frontend/.next/static"; then
    fail "el bundle del frontend referencia el backend de desarrollo (:3001)"
  fi
  (cd "$REPO/apps/frontend" && exec nohup npx next start -p "$FRONTEND_PORT" >"$RUN_DIR/frontend.log" 2>&1 </dev/null) &
  wait_http "http://localhost:${FRONTEND_PORT}/login" 60 || fail "el frontend efimero no responde"
}

# apps: ambos. backend / frontend: recompila y reinicia solo esa aplicacion.
cmd_apps() {
  guard
  load_app_env
  mkdir -p "$RUN_DIR"
  case "${1:-all}" in
    all) start_backend; start_frontend ;;
    backend) start_backend ;;
    frontend) start_frontend ;;
  esac
  echo "isolated-stack: backend :${BACKEND_PORT}, frontend :${FRONTEND_PORT}, logs en $RUN_DIR"
}

# Esquema: valida el schema, comprueba que no quedan migraciones pendientes y
# que la base recien migrada no deriva del schema de Prisma.
cmd_verify() {
  guard
  load_app_env
  (
    cd "$REPO/apps/backend"
    npx prisma validate
    npx prisma migrate status
    npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
  )
  local aplicadas en_repo
  aplicadas="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
    'select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null')"
  en_repo="$(find "$REPO/apps/backend/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l)"
  [ "$aplicadas" = "$en_repo" ] || fail "migraciones aplicadas ($aplicadas) != carpetas en el repo ($en_repo)"
  # El seed inserta filas con id explicito: si una tabla queda fuera de su
  # reajuste de secuencias, el primer INSERT de la aplicacion en esa tabla
  # responde 500 (P2002). Ninguna secuencia puede quedar por detras de sus filas.
  local desfasadas
  desfasadas="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At <<'SQL'
SELECT string_agg(tabla, ', ') FROM (
  SELECT c.relname AS tabla,
         (xpath('/row/m/text()', query_to_xml(format('SELECT coalesce(max(%I), 0) AS m FROM %I', a.attname, c.relname), false, true, '')))[1]::text::bigint AS maximo,
         (xpath('/row/n/text()', query_to_xml(format('SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS n FROM %s', pg_get_serial_sequence(format('%I', c.relname), a.attname)), false, true, '')))[1]::text::bigint AS siguiente
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE ns.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    AND pg_get_serial_sequence(format('%I', c.relname), a.attname) IS NOT NULL
) s WHERE siguiente <= maximo;
SQL
)"
  [ -z "$desfasadas" ] || fail "secuencias de id por detras de las filas sembradas: $desfasadas"
  echo "isolated-stack: verify OK ($aplicadas migraciones, sin deriva, secuencias al dia)"
}

# Las suites corren con el entorno de la pila; nunca con el .env local.
cmd_integration() {
  guard
  load_app_env
  # Tambien DATABASE_URL: ninguna suite puede caer por defecto en la base de los E2E.
  (cd "$REPO/apps/backend" && DATABASE_URL="$IT_DATABASE_URL" DIRECT_URL="$IT_DATABASE_URL" NODE_ENV=test \
    npx vitest run --config vitest.integration.config.ts "$@")
}

cmd_e2e() {
  guard
  load_app_env
  wait_http "http://localhost:${BACKEND_PORT}/api" 5 || fail "el backend efimero no esta arriba (ejecuta 'apps')"
  wait_http "http://localhost:${FRONTEND_PORT}/login" 5 || fail "el frontend efimero no esta arriba (ejecuta 'apps')"
  # Un solo worker, como en CI: los specs comparten cuentas y el limite real de peticiones por IP.
  (cd "$REPO/apps/frontend" && NODE_ENV=test npx playwright test --workers=1 "$@")
}

cmd_status() {
  docker ps -a --filter "label=$LABEL" --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
  for app in "backend:$BACKEND_PORT" "frontend:$FRONTEND_PORT"; do
    if fuser "${app#*:}/tcp" >/dev/null 2>&1; then echo "${app%:*}: escuchando en :${app#*:}"; else echo "${app%:*}: detenido"; fi
  done
}

cmd_down() {
  stop_app frontend
  stop_app backend
  # Solo contenedores con la etiqueta de este script y sin volumenes con nombre.
  for name in $(docker ps -a --filter "label=$LABEL" --format '{{.Names}}'); do
    case "$name" in "$DB_CONTAINER" | "$REDIS_CONTAINER") docker rm -f -v "$name" >/dev/null && echo "eliminado $name" ;; esac
  done
}

case "${1:-}" in
  up) cmd_up ;;
  migrate) cmd_migrate ;;
  apps) cmd_apps all ;;
  backend) cmd_apps backend ;;
  frontend) cmd_apps frontend ;;
  guard) guard ;;
  verify) cmd_verify ;;
  integration) shift; cmd_integration "$@" ;;
  e2e) shift; cmd_e2e "$@" ;;
  env) app_env ;;
  status) cmd_status ;;
  down) cmd_down ;;
  *) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
