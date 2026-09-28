#!/usr/bin/env bash
# Ciclo completo del arnes efimero (G02-C17): guard de representatividad ->
# TLS autofirmado fuera del repo -> build con Dockerfiles productivos -> up ->
# caracterizacion -> destruccion de TODO (contenedores, volumenes, imagenes
# locales del proyecto y TLS), tambien si algo falla.
set -euo pipefail
cd "$(dirname "$0")"

PROJECT="${HARNESS_PROJECT:-uvg-owasp-harness}"
export HARNESS_HTTP_PORT="${HARNESS_HTTP_PORT:-8080}"
export HARNESS_HTTPS_PORT="${HARNESS_HTTPS_PORT:-8443}"

node check-representativity.mjs

HARNESS_TLS_DIR="$(mktemp -d)"
export HARNESS_TLS_DIR
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose -p "$PROJECT" -f docker-compose.yml logs --tail=80 || :
  fi
  docker compose -p "$PROJECT" -f docker-compose.yml down -v --remove-orphans --rmi local || :
  rm -rf "$HARNESS_TLS_DIR"
  exit "$status"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=localhost' \
  -keyout "$HARNESS_TLS_DIR/privkey.pem" -out "$HARNESS_TLS_DIR/fullchain.pem" 2>/dev/null

docker compose -p "$PROJECT" -f docker-compose.yml up -d --build --wait --wait-timeout 900
# G04-C11: la configuración (con P1) debe validar con el nginx real del arnés.
docker compose -p "$PROJECT" -f docker-compose.yml exec -T nginx nginx -t
# G06-C08 (T18): una sola carrera SINTETICA para que el registro emita cookies
# de sesion; vive en la base efimera y se destruye con ella.
HARNESS_T18_CARRERA_ID="$(docker compose -p "$PROJECT" -f docker-compose.yml exec -T postgres \
  psql -U harness -d uvg_collab_harness -qtAc "INSERT INTO carrera (nombre_carrera) VALUES ('Carrera sintetica T18') RETURNING id_carrera" | tr -d '[:space:]')"
export HARNESS_T18_CARRERA_ID
node characterize.mjs
