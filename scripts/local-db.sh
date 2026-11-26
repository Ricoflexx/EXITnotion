#!/usr/bin/env bash
# Start een lokale PostgreSQL voor ontwikkelen en testen.
# - Met Docker: gebruikt docker-compose.yml.
# - Zonder Docker (bijvoorbeeld in een Claude Code-sessie): start het lokale PostgreSQL-cluster.
set -euo pipefail

if docker info >/dev/null 2>&1; then
  docker compose up -d db
  exit 0
fi

if command -v pg_ctlcluster >/dev/null 2>&1; then
  ver=$(pg_lsclusters -h | awk 'NR==1{print $1}')
  pg_ctlcluster "$ver" main start 2>/dev/null || true
  run() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else sudo -u postgres "$@"; fi; }
  run psql -qtc "SELECT 1 FROM pg_roles WHERE rolname='exitnotion'" | grep -q 1 || \
    run psql -qc "CREATE ROLE exitnotion LOGIN SUPERUSER PASSWORD 'exitnotion'"
  for d in exitnotion exitnotion_test; do
    run psql -qtc "SELECT 1 FROM pg_database WHERE datname='$d'" | grep -q 1 || run createdb -O exitnotion "$d"
  done
  echo "PostgreSQL draait op localhost:5432 (databases: exitnotion, exitnotion_test)"
  exit 0
fi

echo "Geen Docker en geen PostgreSQL gevonden. Installeer een van beide." >&2
exit 1
