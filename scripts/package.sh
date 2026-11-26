#!/usr/bin/env bash
# Maakt na `npm run build` het uitrolpakket voor Azure App Service in deploy/app.zip.
set -euo pipefail
rm -rf deploy && mkdir -p deploy/app
cp -r .next/standalone/. deploy/app/
mkdir -p deploy/app/.next && cp -r .next/static deploy/app/.next/static
[ -d public ] && cp -r public deploy/app/public
# Migraties: SQL-bestanden, het script, en de volledige drizzle-orm en postgres pakketten.
cp -r drizzle deploy/app/drizzle
cp scripts/migrate.ts scripts/startup.sh deploy/app/
rm -rf deploy/app/node_modules/drizzle-orm deploy/app/node_modules/postgres
cp -r node_modules/drizzle-orm node_modules/postgres deploy/app/node_modules/
# Lokale geheimen nooit meenemen.
rm -f deploy/app/.env*
(cd deploy/app && zip -qr ../app.zip .)
echo "Pakket klaar: deploy/app.zip"
