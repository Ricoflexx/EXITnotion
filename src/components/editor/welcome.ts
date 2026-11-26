import type { PartialBlock } from "@blocknote/core";

/** Inhoud van de welkomstpagina in een nieuwe privé-ruimte: meteen een spiekbriefje voor de editor. */
export function welcomeBlocks(): PartialBlock[] {
  return [
    { type: "paragraph", content: "Dit is je eigen werkplek. Alleen jij ziet hem, tenzij je iets deelt." },
    { type: "heading", props: { level: 2 }, content: "Zo werk je hier" },
    { type: "bulletListItem", content: [{ type: "text", text: "Typ / ", styles: { bold: true } }, { type: "text", text: "voor een menu met alle bloktypes: kopjes, lijsten, tabellen, afbeeldingen, kolommen.", styles: {} }] },
    { type: "bulletListItem", content: [{ type: "text", text: "Typ @ ", styles: { bold: true } }, { type: "text", text: "om naar een pagina of collega te verwijzen.", styles: {} }] },
    { type: "bulletListItem", content: [{ type: "text", text: "Sneltoetsen: ", styles: { bold: true } }, { type: "text", text: "# voor een kopje, - voor een lijst, 1. voor een genummerde lijst, [] voor een checkbox.", styles: {} }] },
    { type: "bulletListItem", content: [{ type: "text", text: "Slepen: ", styles: { bold: true } }, { type: "text", text: "pak een blok vast bij ⋮⋮ links ervan. Sleep het naast een ander blok voor kolommen.", styles: {} }] },
    { type: "bulletListItem", content: [{ type: "text", text: "Afbeeldingen: ", styles: { bold: true } }, { type: "text", text: "sleep of plak ze gewoon in de pagina.", styles: {} }] },
    { type: "bulletListItem", content: [{ type: "text", text: "Opslaan ", styles: { bold: true } }, { type: "text", text: "gaat vanzelf.", styles: {} }] },
    { type: "heading", props: { level: 2 }, content: "Probeer het meteen" },
    { type: "checkListItem", content: "Maak links met + een nieuwe pagina" },
    { type: "checkListItem", content: "Zet een kopje, een lijstje en een afbeelding op die pagina" },
    { type: "checkListItem", content: "Zoek iets terug met Zoeken (of Ctrl+K)" },
    { type: "toggleListItem", content: "Goed om te weten", children: [
      { type: "paragraph", content: "Beheerders kunnen alles inzien; elke inzage wordt gelogd. Zet hier geen wachtwoorden neer. Bestanden blijven in Box, projecten waar collega's op wachten in Monday." },
    ] },
  ];
}
