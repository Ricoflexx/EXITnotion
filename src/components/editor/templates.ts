/**
 * Inhoud van sjabloonpagina's. De editor vult een pagina hiermee bij de eerste keer openen
 * (zie PageEditor en src/lib/docs.ts setTemplate). Teksten komen uit het huidige Notion-sjabloon van de stagiairs.
 */
type B = Record<string, unknown>;

const t = (text: string, styles: Record<string, boolean> = {}) => ({ type: "text", text, styles });
const p = (...content: (string | B)[]): B => ({ type: "paragraph", content: content.map((c) => (typeof c === "string" ? t(c) : c)) });
const h = (level: 1 | 2 | 3, text: string): B => ({ type: "heading", props: { level }, content: text });
const bullet = (...content: (string | B)[]): B => ({ type: "bulletListItem", content: content.map((c) => (typeof c === "string" ? t(c) : c)) });
const num = (text: string): B => ({ type: "numberedListItem", content: text });
const check = (text: string): B => ({ type: "checkListItem", content: text });
const toggle = (text: string, children: B[]): B => ({ type: "toggleListItem", content: text, children });
const mention = (id: string, label: string): B => ({ type: "mention", props: { kind: "page", targetId: id, label } });
const database = (databaseId: string, viewId = ""): B => ({ type: "database", props: { databaseId, viewId } });
const callout = (text: string): B => ({ type: "quote", content: text });

export function todayLong() {
  return new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

export function logbookDay(): B[] {
  const d = todayLong();
  return [h(3, d.charAt(0).toUpperCase() + d.slice(1)), bullet("")];
}

export type TemplateName = "welcome" | "werkplek" | "tips" | "logboek" | "notulen" | "contentplanning" | "idee";

export function templateBlocks(name: TemplateName, refs: Record<string, string> = {}): B[] {
  switch (name) {
    case "werkplek":
      return [
        p("Je startpunt voor elke dag. Alles hier is van jou; pas het gerust aan."),
        {
          type: "columnList",
          children: [
            {
              type: "column",
              props: { width: 0.75 },
              children: [
                database(refs.todo),
                p(t("Vul elke ochtend (of om tien voor vijf voor de volgende dag) je taken in. Houd ze klein, dan kun je veel afvinken.", { italic: true })),
                h(2, "Belangrijke documenten en linkjes"),
                toggle("Notities", [p(mention(refs.notes, "Notities"), " · tip: maak de titel logisch, bijvoorbeeld \"Instagram carousel Pico 3 september\".")]),
                toggle("Tools en linkjes", [bullet("Box: bestanden"), bullet("Monday: projecten met het team"), bullet("Canva en Adobe: ontwerpen"), bullet("Weavy: AI-beelden")]),
                toggle("Tips en tricks", [p(mention(refs.tips, "Tips en tricks"))]),
                toggle("Belangrijke documenten", [p("Sleep hier documenten in, zoals het personeelshandboek.")]),
                h(2, "Mijlpalen"),
                p(mention(refs.projects, "Afgeronde projecten"), " · ", mention(refs.logbook, "Logboek")),
              ],
            },
            {
              type: "column",
              props: { width: 1.25 },
              children: [
                database(refs.calendar),
                h(2, "Contacten"),
                {
                  type: "table",
                  content: {
                    type: "tableContent",
                    headerRows: 1,
                    rows: [{ cells: ["Wie", "Functie", "E-mailadres"] }, { cells: ["", "", ""] }, { cells: ["", "", ""] }],
                  },
                },
              ],
            },
          ],
        },
      ];
    case "tips":
      return [
        h(2, "Dagelijks plannen"),
        bullet("Vul elke ochtend (of aan het einde van de vorige werkdag) je taken voor die dag in bij je To Do."),
        bullet("Houd taken klein en concreet, zodat je ze ook echt kunt afvinken. \"Blog schrijven\" is te groot en vaag; \"Blog: intro en kopje 1 schrijven\" werkt beter."),
        bullet("Krijg je een taak niet af? Schuif hem door naar morgen in Mijn taken, in plaats van hem te laten liggen."),
        h(2, "Wekelijks plannen"),
        bullet("Kijk aan het begin van de week welke deadlines en afspraken eraan komen, in Kalender en taken."),
        bullet("Verdeel grotere taken over meerdere dagen, zodat je ruimte hebt als iets tegenzit."),
        h(2, "Prioriteren"),
        bullet("Wat heeft een harde deadline, en waar wachten collega's op? Doe dat eerst."),
        bullet("Twijfel je wat voorgaat? Vraag het je teamlead, in plaats van te gokken."),
        h(2, "Gebruik twee plekken, niet meer"),
        p("Je To Do voor kleine, dagelijkse taken; Kalender en taken voor deadlines en afspraken. Verspreid je planning niet over losse notities of je geheugen."),
        h(2, "Notities maken"),
        bullet("Maak de titel logisch. Niet: \"Instagram post\". Wel: \"Instagram carousel Pico 3 september\"."),
        bullet("Typ / voor een menu met blokken, bijvoorbeeld /lijst. Met Tab spring je in."),
        bullet("Schrijf zo dat je het volgende week nog snapt."),
        callout("Wachtwoorden en inloggegevens horen hier niet. Gebruik daarvoor een wachtwoordmanager."),
      ];
    case "logboek":
      return [
        p("Wat heb je vandaag gedaan? Typ /logboek voor een nieuwe dag met de datum erbij. Handig voor school en je eindgesprek."),
        ...logbookDay(),
      ];
    case "notulen":
      return [
        p(t("Datum: ", { bold: true }), new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })),
        p(t("Aanwezig: ", { bold: true }), "typ @ om collega's te noemen"),
        p(t("Doel: ", { bold: true })),
        h(2, "Agenda"),
        num(""),
        h(2, "Besproken"),
        bullet(""),
        h(2, "Besluiten"),
        bullet(""),
        h(2, "Actiepunten"),
        check("Wie · wat · wanneer"),
      ];
    case "contentplanning":
      return [
        h(2, "Doel"),
        p(""),
        h(2, "Thema's per maand"),
        bullet(""),
        h(2, "Draaidagen"),
        {
          type: "table",
          content: { type: "tableContent", headerRows: 1, rows: [{ cells: ["Datum", "Wat filmen?"] }, { cells: ["", ""] }, { cells: ["", ""] }] },
        },
        h(2, "Wat posten we per week?"),
        {
          type: "table",
          content: { type: "tableContent", headerRows: 1, rows: [{ cells: ["Week", "Posts"] }, { cells: ["", ""] }, { cells: ["", ""] }] },
        },
        h(2, "Extra inspiratie"),
        bullet(""),
      ];
    case "idee":
      return [
        h(2, "Het idee in één zin"),
        p(""),
        h(2, "Waarom?"),
        p("Voor wie is het, en wat levert het op?"),
        h(2, "Uitwerking"),
        bullet(""),
        h(2, "Inspiratie en links"),
        p("Plak hier links en afbeeldingen."),
        h(2, "Volgende stappen"),
        check(""),
      ];
    case "welcome":
    default:
      return [
        p("Dit is je eigen werkplek. Alleen jij ziet hem, tenzij je iets deelt."),
        h(2, "Zo werk je hier"),
        bullet(t("Typ / ", { bold: true }), "voor een menu met alle bloktypes: kopjes, lijsten, tabellen, afbeeldingen, kolommen en databases."),
        bullet(t("Typ @ ", { bold: true }), "om naar een pagina of collega te verwijzen."),
        bullet(t("Sneltoetsen: ", { bold: true }), "# voor een kopje, - voor een lijst, 1. voor een genummerde lijst, [] voor een checkbox."),
        bullet(t("Slepen: ", { bold: true }), "pak een blok vast bij ⋮⋮ links ervan. Sleep het naast een ander blok voor kolommen."),
        bullet(t("Afbeeldingen: ", { bold: true }), "sleep of plak ze gewoon in de pagina."),
        bullet(t("Opslaan ", { bold: true }), "gaat vanzelf."),
        h(2, "Probeer het meteen"),
        check("Zet in Mijn taken je eerste taak voor vandaag"),
        check("Maak links met + een nieuwe pagina, met een kopje, een lijstje en een afbeelding"),
        check("Zoek iets terug met Zoeken (of Ctrl+K)"),
        toggle("Goed om te weten", [
          p("Beheerders kunnen alles inzien; elke inzage wordt gelogd. Zet hier geen wachtwoorden neer. Bestanden blijven in Box, projecten waar collega's op wachten in Monday."),
        ]),
      ];
  }
}
