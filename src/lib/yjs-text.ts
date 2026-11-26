import * as Y from "yjs";

/** Naam van het Yjs-fragment waarin BlockNote de pagina bewaart. Niet wijzigen: bestaande pagina's gebruiken deze naam. */
export const FRAGMENT = "document-store";

/**
 * Haalt de platte tekst uit een paginadocument, voor de zoekindex (R70).
 * Elk blok komt op een eigen regel; verwijzingen (@) tellen mee met hun label.
 */
export function extractText(doc: Y.Doc): string {
  const lines: string[] = [];
  const walk = (node: Y.XmlElement | Y.XmlFragment | Y.XmlText, line: string[]): void => {
    if (node instanceof Y.XmlText) {
      for (const op of node.toDelta() as { insert: unknown }[]) {
        if (typeof op.insert === "string") line.push(op.insert);
        else if (op.insert instanceof Y.XmlElement) walk(op.insert, line);
      }
      return;
    }
    if (node instanceof Y.XmlElement) {
      const label = node.getAttribute("label");
      if (typeof label === "string" && label) line.push(label);
      // Elk "blockContainer" is een blok: tekst daarbinnen komt op een eigen regel.
      if (node.nodeName === "blockContainer") {
        const own: string[] = [];
        for (const child of node.toArray()) walk(child as Y.XmlElement, own);
        const text = own.join("").trim();
        if (text) lines.push(text);
        return;
      }
    }
    for (const child of node.toArray()) walk(child as Y.XmlElement, line);
    // Tabelcellen los van elkaar houden, zodat "Wie" en "Functie" aparte woorden blijven.
    if (node instanceof Y.XmlElement && (node.nodeName === "tableCell" || node.nodeName === "tableHeader")) line.push(" ");
  };
  const rest: string[] = [];
  walk(doc.getXmlFragment(FRAGMENT), rest);
  const tail = rest.join("").trim();
  if (tail) lines.push(tail);
  return lines.join("\n").slice(0, 200_000);
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
