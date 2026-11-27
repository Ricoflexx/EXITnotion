#!/usr/bin/env bash
# Opstartcommando op Azure App Service: eerst databasemigraties, dan de app.
set -euo pipefail
cd "$(dirname "$0")"
node --experimental-strip-types migrate.ts
exec node server.js
