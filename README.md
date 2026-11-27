# Homebase

Eigen werkplek in de stijl van Notion voor de stagiairs van EXIT Toys: plannen, notuleren en ideeën uitwerken.
Draait op Azure en je logt in met je EXIT-account (Microsoft Entra ID).

- Onderzoek, eisen en beoordeling: [`docs/beoordeling-eisen.html`](docs/beoordeling-eisen.html)
- Bouwplan en besluiten: [`docs/bouwplan.md`](docs/bouwplan.md)
- Azure inrichten: [`docs/azure-setup.md`](docs/azure-setup.md)
- Importeren uit Notion: [`docs/notion-import.md`](docs/notion-import.md)
- Testplan (twee weken naast Notion): [`docs/testplan.md`](docs/testplan.md)

Eigenaar: Ricardo. Azure en uitrol: Sven.

## Overdracht naar een eigen repository

De code staat compleet in deze repository, met de volledige geschiedenis. Er staan geen geheimen in: wachtwoorden,
tokens en sleutels komen alleen in de GitHub-omgeving `productie` en in Azure (zie `docs/azure-setup.md`).

Overzetten naar een nieuwe (lege) repository, bijvoorbeeld in de GitHub-organisatie van EXIT:

```bash
git clone --branch claude/zen-planck-lipd70 https://github.com/Ricoflexx/EXITnotion.git homebase
cd homebase
git remote rename origin oud
git remote add origin https://github.com/<organisatie>/<repository>.git
git push -u origin HEAD:main
```

Daarna in de nieuwe repository:

1. **Settings → Collaborators/Teams:** Ricardo (en wie verder meebouwt) toevoegen met schrijfrechten.
2. **Settings → Branches:** branch protection op `main` (pull request verplicht).
3. **Settings → Environments:** omgeving `productie` aanmaken, met de secrets en variables uit `docs/azure-setup.md`.
4. De workflow **Controle** draait meteen bij elke push. **Uitrollen** wordt overgeslagen tot `AZURE_WEBAPP_NAME`
   is ingesteld; **Infrastructuur** start je met de hand.

`docs/beoordeling-eisen.html` is het gearchiveerde onderzoek en de beoordeling van de eisen. Het stemmen werkte alleen
op de oorspronkelijke gedeelde pagina; in de repository is het een naslagdocument.

## Stand van zaken

| Blok | Inhoud | Status |
|---|---|---|
| 0. Fundament | Inloggen, privé-ruimtes, teamruimtes, delen, rechten, beheerdersinzage met inzagelog, verplaatsen, overdragen, prullenbak, favorieten, Azure-uitrol | **Klaar** |
| 1. Schrijven | Editor met blokken, /-menu, sneltoetsen, slepen, tabellen, kolommen, uitklapblokken, uploads, @-verwijzingen, automatisch opslaan, zoeken (Ctrl+K), wijzigingen van anderen binnen enkele seconden | **Klaar** |
| 2. Plannen | Databases met tabel, bord en kalender, eigen velden en statussen, filteren, sorteren en groeperen, database midden op een pagina, Mijn taken met slimme lijsten (Vandaag, Morgen, 7 dagen), stagiair-werkplek naar Liv's voorbeeld, sjablonen (notulen, logboek, contentplanning, idee) | **Klaar** |
| 3. Import en test | Import uit Notion (Beheer → Importeren uit Notion) en het testplan voor twee weken naast Notion | **Import klaar**; test start zodra de app op Azure draait |

## Lokaal starten

Nodig: [Node.js 22](https://nodejs.org) (LTS), Git, en [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(of een eigen PostgreSQL 16). Werkt op Windows, Mac en Linux.

```bash
git clone <url-van-de-repository> homebase
cd homebase
npm install
docker compose up -d db
```

Maak een bestand `.env.local` in de map met deze inhoud (zet achter `AUTH_SECRET` de uitkomst van
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`):

```
DATABASE_URL=postgres://homebase:homebase@localhost:5432/homebase
AUTH_SECRET=
AUTH_URL=http://localhost:3000
AUTH_DEV_LOGIN=true
```

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 en log in met de **testlogin** (Beheerder Test, Stagiair Een of Stagiair Twee). De testlogin
werkt alleen lokaal en nooit op Azure. Wissel van gebruiker via Uitloggen, of gebruik een tweede browser(venster) om
samen bewerken te proberen.

## Controleren

```bash
npm run typecheck
npm test          # unit- en integratietests; gebruikt de database homebase_test
npm run build
```

GitHub Actions draait dezelfde controles bij elke push (`.github/workflows/ci.yml`).

## Hoe het in elkaar zit

| Map | Inhoud |
|---|---|
| `src/db/schema.ts` | Datamodel (Drizzle ORM). Na een wijziging: `npm run db:generate` voor een nieuwe migratie in `drizzle/` |
| `src/lib/permissions.ts` | Rechtenmodel als pure functies. **Begin hier** als je wilt snappen wie wat mag |
| `src/lib/access.ts` | Alles wat pagina's leest of wijzigt, altijd via de rechtencontrole |
| `src/lib/admin.ts` | Beheerfuncties: gebruikers, teamruimtes, overdragen, inzagelog |
| `src/lib/docs.ts` | Pagina-inhoud als Yjs-document: opslaan, samenvoegen, ophalen, wie er nog meer is |
| `src/components/editor/` | De editor (BlockNote) met /-menu, kolommen en @-verwijzingen |
| `src/lib/db-model.ts` | Databases: veldtypes, weergaven, filteren, sorteren, groeperen (pure functies, ook in de browser) |
| `src/lib/db-templates.ts` | Databasesjablonen: Kalender en taken, To Do, Contentkalender, Notities, Afgeronde projecten |
| `src/lib/databases.ts` | Databases en rijen opslaan, Mijn taken, de stagiair-werkplek inrichten |
| `src/components/database/` | Tabel, bord, kalender, cellen per veldtype, menu's voor velden en weergaven |
| `src/components/editor/templates.ts` | Inhoud van sjabloonpagina's (werkplek, tips, notulen, logboek, …) |
| `src/lib/notion/` | Import uit Notion: API-client, omzetten van blokken en databases, achtergrondtaak |
| `src/components/editor/schema.tsx` | Het editorschema; ook gebruikt door de server (import) |
| `src/lib/search.ts` | Zoeken met de Nederlandse full-text search van PostgreSQL |
| `src/lib/files.ts`, `storage.ts` | Uploads: Azure Blob Storage, lokaal een map op schijf |
| `src/auth.ts` | Inloggen met Entra ID (en de lokale testlogin) |
| `src/app/` | Schermen (Next.js App Router) en serveracties (`actions.ts`) |
| `infra/main.bicep` | Azure-resources |
| `tests/` | Tests voor rechten en database |

### Hoe de editor opslaat
De inhoud van een pagina is een Yjs-document. De browser stuurt elke wijziging na een korte pauze naar de server, en
de server voegt hem samen met wat er al stond. Typen twee mensen tegelijk, dan blijft beider werk staan. Elke 4 seconden
haalt de browser wijzigingen van anderen op en laat zien wie er nog meer bewerkt. In versie 1.1 komt hier live samen
bewerken (Hocuspocus over websockets) voor in de plaats, op hetzelfde Yjs-document.

Licenties: zie [`docs/licenties.md`](docs/licenties.md). Let op de GPL-licentie van de kolommen-functie.

### Rechten in het kort
- Je eigen privé-ruimte: volledige toegang. Teamruimte: het niveau van je lidmaatschap.
- Een pagina delen geeft rechten op die pagina en alle subpagina's: lezen, reageren, bewerken of volledig.
- Beheerders kunnen alles **lezen**. Lukt dat alleen via de beheerdersrol, dan komt het in het inzagelog.
  Bewerken via de beheerdersrol kan niet.
- Een uitgezet account heeft nergens toegang.
