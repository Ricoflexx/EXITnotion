import { beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { AccessError, createPage, getSidebar, sharePage, upsertUserFromLogin, type CurrentUser } from "@/lib/access";
import { applyDocUpdate, loadDoc, pullDoc } from "@/lib/docs";
import { saveUpload, readUpload } from "@/lib/files";
import { searchPages, toPrefixQuery } from "@/lib/search";
import { extractText, FRAGMENT, fromBase64, toBase64 } from "@/lib/yjs-text";

/** Bouwt een document zoals BlockNote dat doet: blockGroup > blockContainer > paragraph > tekst. */
function docWith(...paragraphs: string[]) {
  const doc = new Y.Doc();
  const group = new Y.XmlElement("blockGroup");
  doc.getXmlFragment(FRAGMENT).insert(0, [group]);
  for (const text of paragraphs) addParagraph(group, text);
  return doc;
}
function addParagraph(group: Y.XmlElement, text: string) {
  const container = new Y.XmlElement("blockContainer");
  const para = new Y.XmlElement("paragraph");
  para.insert(0, [new Y.XmlText(text)]);
  container.insert(0, [para]);
  group.insert(group.length, [container]);
}

const stamp = Date.now();
let liv: CurrentUser, nikki: CurrentUser;
const cu = (u: CurrentUser) => ({ id: u.id, isAdmin: u.isAdmin, active: u.active, name: u.name, email: u.email });

beforeAll(async () => {
  liv = cu(await upsertUserFromLogin({ entraOid: `d-liv-${stamp}`, email: `d-liv-${stamp}@test.local`, name: "Liv" }));
  nikki = cu(await upsertUserFromLogin({ entraOid: `d-nikki-${stamp}`, email: `d-nikki-${stamp}@test.local`, name: "Nikki" }));
});

async function newPrivatePage(user: CurrentUser, title: string) {
  const spaceId = (await getSidebar(user)).privateSpace!.space.id;
  return createPage(user, { spaceId, title });
}

describe("extractText", () => {
  it("zet elk blok op een eigen regel", () => {
    expect(extractText(docWith("Draaidag 17 september", "Trampoline-onderhoud"))).toBe("Draaidag 17 september\nTrampoline-onderhoud");
  });

  it("neemt het label van een @-verwijzing mee", () => {
    const doc = docWith("Zie");
    const para = (doc.getXmlFragment(FRAGMENT).get(0) as Y.XmlElement).get(0) as Y.XmlElement;
    const text = (para.get(0) as Y.XmlElement).get(0) as Y.XmlText;
    const mention = new Y.XmlElement("mention");
    mention.setAttribute("label", "Social Media Hub");
    text.insertEmbed(text.length, mention);
    expect(extractText(doc)).toContain("Social Media Hub");
  });
});

describe("toPrefixQuery", () => {
  it("maakt veilige voorvoegsel-zoekvragen", () => {
    expect(toPrefixQuery("draai dag")).toBe("draai:* & dag:*");
    expect(toPrefixQuery("  ':*&|!() ")).toBeNull();
  });
});

describe("opslaan en samenvoegen", () => {
  it("voegt wijzigingen van twee mensen samen in plaats van te overschrijven", async () => {
    const page = await newPrivatePage(liv, "Samen schrijven");
    await sharePage(liv, page.id, nikki.id, "edit");

    // Beide beginnen met hetzelfde (lege) document en schrijven tegelijk iets.
    const a = docWith("Tekst van Liv");
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    await applyDocUpdate(liv, page.id, toBase64(Y.encodeStateAsUpdate(a)));

    const group = b.getXmlFragment(FRAGMENT).get(0) as Y.XmlElement;
    addParagraph(group, "Tekst van Nikki");
    await applyDocUpdate(nikki, page.id, toBase64(Y.encodeStateAsUpdate(b)));

    const stored = new Y.Doc();
    Y.applyUpdate(stored, fromBase64((await loadDoc(liv, page.id))!));
    expect(extractText(stored)).toBe("Tekst van Liv\nTekst van Nikki");

    const [row] = await db.select({ searchText: pages.searchText }).from(pages).where(eq(pages.id, page.id));
    expect(row.searchText).toContain("Tekst van Nikki");
  });

  it("weigert opslaan met alleen leesrechten", async () => {
    const page = await newPrivatePage(liv, "Alleen lezen");
    await sharePage(liv, page.id, nikki.id, "read");
    await expect(applyDocUpdate(nikki, page.id, toBase64(Y.encodeStateAsUpdate(docWith("Hack"))))).rejects.toBeInstanceOf(AccessError);
  });

  it("geeft bij ophalen alleen wat nieuw is, en meldt wie er nog meer is", async () => {
    const page = await newPrivatePage(liv, "Ophalen");
    await sharePage(liv, page.id, nikki.id, "edit");
    const a = docWith("Eerste regel");
    await applyDocUpdate(liv, page.id, toBase64(Y.encodeStateAsUpdate(a)));

    await pullDoc(liv, page.id, toBase64(Y.encodeStateVector(a)), true);
    const nothingNew = await pullDoc(liv, page.id, toBase64(Y.encodeStateVector(a)), true);
    expect(nothingNew.update).toBeNull();

    const forNikki = await pullDoc(nikki, page.id, null, false);
    expect(forNikki.update).not.toBeNull();
    expect(forNikki.others).toEqual([{ name: "Liv", editing: true }]);
  });
});

describe("zoeken (R70)", () => {
  it("vindt pagina's op inhoud en op een deel van een woord", async () => {
    const page = await newPrivatePage(liv, "Planning");
    await applyDocUpdate(liv, page.id, toBase64(Y.encodeStateAsUpdate(docWith(`Halloween-campagne met pompoenen ${stamp}`))));
    const hits = await searchPages(liv, "pompoen");
    expect(hits.map((h) => h.id)).toContain(page.id);
    expect(hits.find((h) => h.id === page.id)?.snippet).toContain("<b>");
  });

  it("toont geen privé-pagina's van een ander, wel wat gedeeld is", async () => {
    const geheim = await newPrivatePage(liv, `Geheimplan${stamp}`);
    expect((await searchPages(nikki, `Geheimplan${stamp}`)).map((h) => h.id)).not.toContain(geheim.id);
    await sharePage(liv, geheim.id, nikki.id, "read");
    const sub = await createPage(liv, { parentId: geheim.id, title: `Subplan${stamp}` });
    expect((await searchPages(nikki, `Subplan${stamp}`)).map((h) => h.id)).toContain(sub.id);
  });

  it("escapet tekst uit pagina's in het fragment", async () => {
    const page = await newPrivatePage(liv, "Escape");
    await applyDocUpdate(liv, page.id, toBase64(Y.encodeStateAsUpdate(docWith(`<script>alert(1)</script> zoekwoord${stamp}`))));
    const [hit] = await searchPages(liv, `zoekwoord${stamp}`);
    expect(hit.snippet).not.toContain("<script>");
  });
});

describe("bestanden (R25)", () => {
  it("laat alleen wie de pagina mag zien het bestand downloaden", async () => {
    const page = await newPrivatePage(liv, "Moodboard");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "foto.png", { type: "image/png" });
    const { id } = await saveUpload(liv, page.id, file);

    const ok = await readUpload(liv, id);
    expect(ok.inline).toBe(true);
    expect(ok.data.byteLength).toBe(4);
    await expect(readUpload(nikki, id)).rejects.toBeInstanceOf(AccessError);
  });

  it("biedt SVG en HTML alleen als download aan", async () => {
    const page = await newPrivatePage(liv, "Bestanden");
    const svg = new File(["<svg onload='alert(1)'/>"], "x.svg", { type: "image/svg+xml" });
    const { id } = await saveUpload(liv, page.id, svg);
    expect((await readUpload(liv, id)).inline).toBe(false);
  });
});
