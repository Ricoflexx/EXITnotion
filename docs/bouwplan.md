# EXITnotion: bouwplan (stap 4, kritische blik)

Status: voorstel, wacht op besluiten B1 tot en met B6 (onderaan).
Bron: onderzoek en beoordeling in `docs/beoordeling-eisen.html` (stap 1 tot en met 3).

## 1. Kritische conclusies

### 1.1 De scope is te groot voor één eerste versie
De beoordeling leverde 47 Moet-eisen op van de 58. Daarmee helpt de prioriteit niet meer bij kiezen. We maken daarom
een harde **versie 1**: het minimum waarmee de stagiairs hun dagelijkse werk in Notion kunnen loslaten.
Al het andere komt in versie 1.1 of 2. Het blijft een Moet, maar komt later.

Toets voor versie 1: *kan Liv haar huidige werkplek (startpagina, To Do, kalender en taken, notities, logboek) hierin
nabouwen en elke dag gebruiken?*

### 1.2 Zelf bouwen is een groot project. We kiezen het bewust
EXIT heeft al een Notion-workspace. Het abonnement voor een handvol gebruikers kost minder dan de bouw- en
onderhoudsuren van een eigen systeem. De keuze voor route A rust dus niet op kosten, maar op vier andere redenen:
eigen accounts via Entra ID, data op de eigen Azure-omgeving, beheerders die alles zien, en een app zonder de
zware functies die Notion complex maken. Dat zijn geldige redenen, maar dan moeten we het bouwen ook klein en
onderhoudbaar houden. Zie 1.5.

### 1.3 Nóg een tool naast Monday, Box, Word en Teams
De stagiairs gebruiken die tools al, "omdat de rest van het bedrijf ermee werkt". Zonder afspraak dubbelt
EXITnotion met Monday. Voorstel (besluit B3):

| Waar | Wat |
|---|---|
| **EXITnotion** | Persoonlijke werkplek: plannen, To Do, notuleren, logboek, ideeën uitwerken, teamhubs van de stagiairs (zoals de Social Media Hub) |
| **Monday** | Projecten en taken waar collega's buiten de stagiairs op wachten of in meekijken |
| **Box** | Bestanden. EXITnotion linkt ernaar, maar kopieert ze niet (R90) |
| **Teams** | Chatten en bellen |
| **Word** | Officiële documenten zoals het stageverslag. EXITnotion exporteert naar Word (R83) |

### 1.4 De zwaarste onderdelen
| Onderdeel | Waarom zwaar | Keuze |
|---|---|---|
| Live samen bewerken (R61) | Gelijktijdige wijzigingen samenvoegen, plus een realtime-server met rechtencontrole | De editor bouwen we **vanaf dag één op Yjs**, want achteraf ombouwen is duur. Meerdere mensen tegelijk zetten we pas aan in versie 1.1. In versie 1 ziet een tweede bezoeker "Liv is deze pagina aan het bewerken". |
| Databases met weergaven (R30 tot en met R34) | Het hart van Notion: velden, filters en drie weergaven | Een vaste set veldtypes, geen formules of relaties (R38 blijft Kan) |
| Offline (R88) | Synchronisatie en conflicten, en het werk gebeurt toch op kantoor | Voorstel: **verlagen naar Niet nu** (besluit B2). Yjs maakt het later wel mogelijk. Het is ook tegenstrijdig met R87 (telefoon), dat op Niet nu staat. |
| Vrij canvas à la PureRef (R53) | Een tekenomgeving bouwen is een product op zich | Versie 2, eventueel via de open-source bibliotheek tldraw (let op de licentie) |
| Import uit Notion (R84) | Notion-blokken en -databases omzetten | Eenmalig, via de Notion-API, alleen voor pagina's en databases met basisvelden. Weergaven bouwen we met de hand na. Dit moet klaar zijn voor de livegang. |

### 1.5 Onderhoud na de stage
Stagiairs wisselen, de code blijft. Eisen aan de bouw zelf:
- Eén taal (TypeScript), zo min mogelijk losse diensten en geen eigen zoekserver.
- Infrastructuur als code (Bicep) en een automatische uitrol via GitHub Actions.
- Tests voor rechten en opslag (de plekken waar fouten pijn doen).
- Een README die een nieuwe ontwikkelaar binnen een dag op weg helpt.
- Een vaste eigenaar binnen EXIT (besluit B4).

### 1.6 Privacy
Beheerders zien alles (R03). Dat mag, mits het open is:
- Bij de eerste keer inloggen meldt de app dit, en het staat in de spelregels.
- **Nieuw voorstel R93:** elke inzage door een beheerder in een privé-pagina van een ander wordt gelogd (wie, wat, wanneer).
- Wachtwoorden horen niet in EXITnotion. In de huidige Notion bestaat een categorie "inloggegevens".

### 1.7 "Geen idee" wat je zou missen
Een eerlijk antwoord, maar het betekent dat we de echte behoefte pas zien als jullie het gebruiken. Daarom testen we
versie 1 eerst **twee weken naast Notion**, met Liv's werkplek als testcase, voordat we verder bouwen.

## 2. Versie 1 (de eerste bruikbare versie)

| Gebied | Eisen in versie 1 |
|---|---|
| Toegang | R01 inloggen met EXIT-account, R02 privé-omgeving, R03 beheerders zien alles (+ R93 inzagelog), R04 delen (lezen, reageren, bewerken), R05 teamruimte |
| Werkplek | R10 stagiair-werkplek, R11 kolommen, R12 database op een pagina, R13 uitklapblokken, R72 sjablonen |
| Schrijven | R20 basisblokken, R21 /-menu, R22 sneltoetsen, R23 slepen, R24 tabellen, R25 uploads, R28 @-verwijzingen, R29 automatisch opslaan |
| Plannen | R30 takendatabase, R31 eigen statussen, R32 kalender, R33 bord, R34 filteren en groeperen, R35 Mijn taken, R36 dagelijkse To Do |
| Notuleren | R40 notulensjabloon, R42 logboek per dag |
| Vinden en beheer | R70 zoeken, R71 favorieten en recent, R63 prullenbak, R80 beheerdersoverzicht, R82 back-ups, R85 Nederlands, R86 snel |
| Overstap | R84 import uit Notion |

**Versie 1.1** (na de testperiode): R61 live samen bewerken, R60 opmerkingen, R64 meldingen, R62 versiegeschiedenis,
R41 actiepunten worden taken, R43 notulenoverzicht, R50 ideeënbord, R52 verplaatsen tussen ruimtes, R73 archief,
R81 overdragen, R90 Box, R27 en R26 embeds en linkkaartjes, R91 snelle invoer, R92 prioriteit, herhalen en herinneringen,
R89 huisstijl afmaken.

**Versie 2:** R83 export, R14 iconen en omslagfoto, R37 tijdlijn en grafieken, R51 moodboard, R53 canvas,
R88 offline (als B2 dat zo houdt), R38 formules (Kan).

> Let op: R52 (verplaatsen) en R81 (overdragen) staan in 1.1. Als jullie de overstap van de Social Media Hub
> meteen willen maken, schuiven ze naar versie 1 (besluit B1).

## 3. Techniek (route A)

| Laag | Keuze | Waarom |
|---|---|---|
| App | Next.js (React, TypeScript): frontend en API in één | Eén codebase, veel kennis en documentatie beschikbaar |
| Editor | BlockNote (gebouwd op Tiptap/ProseMirror) | Blokken, /-menu, slepen en sneltoetsen zitten erin. Draait op Yjs. |
| Samen bewerken | Yjs + Hocuspocus (een kleine Node-server) | Standaardcombinatie met BlockNote. Rechten controleren we bij het verbinden. |
| Tabel, bord, kalender | TanStack Table, dnd-kit, FullCalendar (MIT-deel) | Bewezen bibliotheken, we bouwen alleen de koppeling zelf |
| Datums in snelle invoer | chrono-node (kan Nederlands) | Voor "morgen 10:00" (R91) |
| Database | Azure Database for PostgreSQL (Flexible Server), Prisma | Back-ups tot 35 dagen terug te zetten (R82). Zoeken met de Nederlandse full-text search van Postgres (R70). |
| Bestanden | Azure Blob Storage | Uploads (R25) |
| Inloggen | Microsoft Entra ID (single-tenant) via Auth.js | Alleen EXIT-accounts. De beheerdersrol komt uit een Entra-groep "EXITnotion-Beheerders". |
| Hosting | Azure App Service (Linux), regio West Europe | Ondersteunt websockets, eenvoudig te beheren |
| Uitrol | GitHub Actions + Bicep | Herhaalbaar en vastgelegd in code |
| Lokaal ontwikkelen | Docker Compose: Postgres + Azurite (Blob-emulator) + een test-login | We kunnen bouwen voordat de Azure-toegang er is |

**Licentie-check (vóór de bouw):** de basis van BlockNote is MPL-2.0. De extra pakketten ("xl-"), zoals
**multi-column (R11)** en export naar PDF en Word, vallen onder GPL-3.0 of een betaalde licentie. Omdat we intern hosten
en niets verspreiden, is GPL waarschijnlijk geen probleem, maar dat moeten we bevestigen. Het alternatief is kolommen
zelf bouwen.

**Rechtenmodel:** werkplek → ruimtes (één privé-ruimte per persoon, plus teamruimtes) → boom van pagina's. Per pagina
geven we rechten aan een persoon of groep (lezen, reageren, bewerken, volledig), en subpagina's erven die. Beheerders mogen
alles en elke inzage wordt gelogd. Een database is een pagina waarvan de rijen ook pagina's zijn.

**Veldtypes in databases:** tekst, getal, selectie, meerkeuze, status (met groepen *te doen*, *bezig*, *klaar*),
datum (met tijd en bereik), persoon, checkbox, URL, bestand, aangemaakt en gewijzigd. Geen formules of relaties.

## 4. Planning (grove schatting)

Aanname: één ontwikkelaar met Claude Code, ongeveer 3 dagen per week. Dit is een schatting met een ruime marge,
geen toezegging.

| Blok | Inhoud | Weken |
|---|---|---|
| 0. Fundament | Repo, lokaal ontwikkelen, Entra-login, rechtenmodel, Azure-uitrol, back-ups | 2–3 |
| 1. Schrijven | Editor, paginaboom, uploads, zoeken, prullenbak, favorieten | 3–4 |
| 2. Plannen | Databases, drie weergaven, Mijn taken, To Do, sjablonen en stagiair-werkplek | 4–5 |
| 3. Import + test | Notion-import, Liv's werkplek overzetten, twee weken naast Notion | 2–3 |
| **Versie 1** | | **11–15** |
| Versie 1.1 | Samenwerken, notulen en ideeën, Box, TickTick-functies | 5–7 |

## 5. Besluiten die nodig zijn

- **B1. Versie-1-scope.** Akkoord met hoofdstuk 2? Moeten R52 en R81 erbij?
- **B2. Offline (R88)** van Zou moeten naar Niet nu?
- **B3. Afspraak over tools.** Akkoord met de verdeling in 1.3?
- **B4. Eigenaar en bouwer.** Wie bouwt, en wie onderhoudt het na de stage?
- **B5. Privacy.** Akkoord met R93 (inzagelog) en de melding bij de eerste keer inloggen?
- **B6. Azure.** Wie regelt de subscription of resourcegroep, de app-registratie in Entra ID en het domein
  (bijvoorbeeld `werkplek.dutchtoysgroup.com`)? Zonder die toegang bouwen we eerst lokaal.
