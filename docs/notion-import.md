# Importeren uit Notion

Hiermee zet je een werkplek uit Notion over naar EXITnotion, bijvoorbeeld de stagewerkplek van Liv of de Social Media Hub.
Alleen beheerders kunnen importeren (Beheer → Importeren uit Notion).

## Wat meekomt

| Uit Notion | In EXITnotion |
|---|---|
| Pagina's en subpagina's (met emoji-icoon) | Pagina's in dezelfde boomstructuur |
| Tekst met vet, cursief, doorhalen, onderstrepen, code, kleuren en links | Hetzelfde |
| Kopjes (ook uitklapbare), lijsten, checklists, uitklapblokken, citaten, scheidingslijnen, code | Hetzelfde |
| Callouts | Citaat met het emoji ervoor |
| Kolommen | Kolommen (met dezelfde breedteverhouding) |
| Tabellen | Tabellen (met kopregel) |
| Afbeeldingen, bestanden, pdf's, video, audio | Gedownload en opgeslagen bij ons (max. 25 MB per bestand). Externe links blijven links. |
| Bladwijzers, embeds en linkvoorbeelden | Een link |
| @-verwijzing naar een pagina binnen de import | Verwijzing naar de nieuwe pagina |
| @-verwijzing naar een collega | Verwijzing naar die collega, als het e-mailadres bij ons bekend is |
| Databases, inline en als volle pagina | Databases. Een inline database staat weer midden op de pagina. |
| Velden: tekst, getal, keuze, meerkeuze, status (met groepen), datum, persoon, vinkje, link | Hetzelfde |
| Velden: e-mail, telefoon, formule, rollup, ID, plaats, aangemaakt/bewerkt | Tekstveld met de waarde van het moment van importeren |
| Rijen van databases, met hun eigen inhoud | Rijen, met eigenschappen en inhoud |

## Wat níet meekomt

- **Weergaven van databases.** De Notion-API geeft die niet door. Elke database krijgt Tabel, Bord (als er een status
  of keuze is) en Kalender (als er een datum is). Filters en extra weergaven stel je daarna zelf in.
- **Relaties tussen databases.** Die staan in het log als overgeslagen.
- **Gekoppelde databases** (een weergave van een database die ergens anders staat). Importeer de originele database.
- **Opmerkingen, versiegeschiedenis, inhoudsopgave, kruimelpad en sjabloonknoppen.**
- **Personen zonder bekend e-mailadres.** Die vallen weg uit persoonsvelden. Laat collega's eerst één keer inloggen
  in EXITnotion, dan zijn ze bekend.

Alles wat is overgeslagen staat aan het eind van het importlog.

## Stappen

### 1. Integratie maken in Notion (eenmalig)

1. Ga naar https://www.notion.so/profile/integrations en kies **New integration**.
2. Naam: `EXITnotion import`. Kies de workspace van EXIT. Type: **Internal**.
3. Capabilities: alleen **Read content**, en bij User capabilities **Read user information including email addresses**
   (nodig om personen te koppelen).
4. Sla op en kopieer het **Internal Integration Secret**. Dat is het token. Behandel het als een wachtwoord.

### 2. De pagina delen met de integratie

Open de pagina in Notion (bijvoorbeeld *Liv - Stage Workspace*) → **•••** rechtsboven → **Connections** →
kies `EXITnotion import`. Alles onder die pagina is dan leesbaar voor de integratie.

Staat een database ergens anders en is hij alleen gekoppeld, deel dan ook die pagina.

### 3. Importeren

1. EXITnotion → **Beheer → Importeren uit Notion**.
2. Plak de link van de pagina (in Notion: **•••** → **Link kopiëren**) en het token.
3. Kies waar het moet komen. Voor een stagewerkplek is dat de privé-ruimte van de stagiair (die moet dus al één keer
   ingelogd zijn). Voor de Social Media Hub is dat een teamruimte.
4. Klik **Import starten**. De voortgang verschijnt op dezelfde pagina. Reken op ongeveer een minuut per honderd
   pagina's en rijen (Notion laat maar drie verzoeken per seconde toe).

### 4. Na de import

- Open het resultaat en loop het samen met de stagiair door.
- Stel de weergaven van belangrijke databases opnieuw in (bijvoorbeeld de kalender in week-weergave zonder weekend).
- Trek in Notion de connection weer in en verwijder de integratie, als je klaar bent met importeren.

Een import nog eens draaien maakt een tweede kopie; hij werkt niets bij. Gooi een mislukte of dubbele import weg via
de prullenbak.

## Voor ontwikkelaars

- Code: `src/lib/notion/` (`client.ts` praat met de API, `convert.ts` zet om, `import.ts` regelt de taak).
- Tests: `tests/notion-import.test.ts` met een nagebootste Notion-API in `tests/notion-fixture.ts`.
- De import draait als achtergrondtaak in het App Service-proces. Herstart de app niet tijdens een import; een
  onderbroken import blijft op "Bezig" staan en kun je opnieuw starten.
- Notion-API-versie `2022-06-28`. Stopt Notion daarmee, pas dan `client.ts` aan.
