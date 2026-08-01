#!/bin/sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c \
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping | grep -q PONG
docker compose -f "$COMPOSE_FILE" exec -T ollama ollama list >/dev/null
docker compose -f "$COMPOSE_FILE" exec -T n8n node -e \
  "fetch('http://127.0.0.1:5678/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
docker compose -f "$COMPOSE_FILE" exec -T n8n-worker node -e \
  "fetch('http://127.0.0.1:5678/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

echo "Checkpoint 1: todos os serviços estão saudáveis."
