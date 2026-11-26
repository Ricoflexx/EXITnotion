# EXITnotion

Eigen werkplek in de stijl van Notion voor de stagiairs van EXIT Toys: plannen, notuleren en ideeën uitwerken.
Draait op Azure en je logt in met je EXIT-account (Microsoft Entra ID).

- Onderzoek, eisen en beoordeling: [`docs/beoordeling-eisen.html`](docs/beoordeling-eisen.html)
- Bouwplan en besluiten: [`docs/bouwplan.md`](docs/bouwplan.md)
- Azure inrichten: [`docs/azure-setup.md`](docs/azure-setup.md)

Eigenaar: Ricardo. Azure en uitrol: Sven.

## Stand van zaken

| Blok | Inhoud | Status |
|---|---|---|
| 0. Fundament | Inloggen, privé-ruimtes, teamruimtes, delen, rechten, beheerdersinzage met inzagelog, verplaatsen, overdragen, prullenbak, favorieten, Azure-uitrol | **Klaar** |
| 1. Schrijven | Editor met blokken, /-menu, sneltoetsen, slepen, tabellen, kolommen, uitklapblokken, uploads, @-verwijzingen, automatisch opslaan, zoeken (Ctrl+K), wijzigingen van anderen binnen enkele seconden | **Klaar** |
| 2. Plannen | Databases met tabel, bord en kalender, Mijn taken, To Do, stagiair-werkplek | Volgende |
| 3. Import en test | Notion-import, twee weken naast Notion | |

## Lokaal starten

Nodig: Node 22, en PostgreSQL 16 of Docker.

```bash
npm install
cp .env.example .env.local      # vul AUTH_SECRET in: openssl rand -base64 32
npm run db:local                # start PostgreSQL (Docker of lokaal)
npm run db:migrate
npm run db:seed                 # testgebruikers: Beheerder Test, Stagiair Een, Stagiair Twee
npm run dev
```

Open http://localhost:3000 en log in met de **testlogin**. Die werkt alleen lokaal (`AUTH_DEV_LOGIN=true`) en
nooit op Azure.

## Controleren

```bash
npm run typecheck
npm test          # unit- en integratietests; gebruikt de database exitnotion_test
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
