import { beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, files, importJobs, pages } from "@/db/schema";
import { AccessError, getSidebar, upsertUserFromLogin, type CurrentUser } from "@/lib/access";
import { getDatabase } from "@/lib/databases";
import { loadDoc } from "@/lib/docs";
import { startNotionImport } from "@/lib/notion/import";
import { parseNotionId } from "@/lib/notion/client";
import { searchPages } from "@/lib/search";
import { extractText, FRAGMENT, fromBase64 } from "@/lib/yjs-text";
import { IDS, makeNotionFixture } from "./notion-fixture";

const stamp = Date.now();
let admin: CurrentUser, liv: CurrentUser, nikki: CurrentUser;
const cu = (u: CurrentUser) => ({ id: u.id, isAdmin: u.isAdmin, active: u.active, name: u.name, email: u.email });

beforeAll(async () => {
  admin = cu(await upsertUserFromLogin({ entraOid: `n-admin-${stamp}`, email: `n-admin-${stamp}@test.local`, name: "Beheerder", isAdmin: true }));
  liv = cu(await upsertUserFromLogin({ entraOid: `n-liv-${stamp}`, email: `n-liv-${stamp}@test.local`, name: "Liv N" }));
  nikki = cu(await upsertUserFromLogin({ entraOid: `n-nikki-${stamp}`, email: `n-nikki-${stamp}@test.local`, name: "Nikki N" }));
});

async function text(user: CurrentUser, pageId: string) {
  const state = await loadDoc(user, pageId);
  if (!state) return "";
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromBase64(state));
  return extractText(doc);
}

describe("parseNotionId", () => {
  it("haalt het id uit verschillende soorten links", () => {
    expect(parseNotionId("https://app.notion.com/p/3bb8cc3f3deb81e3be6debb15947019a?pvs=204")).toBe("3bb8cc3f-3deb-81e3-be6d-ebb15947019a");
    expect(parseNotionId("https://www.notion.so/Liv-Stage-Workspace-3bb8cc3f3deb81e3be6debb15947019a")).toBe("3bb8cc3f-3deb-81e3-be6d-ebb15947019a");
    expect(parseNotionId("geen link")).toBeNull();
  });
});

describe("import uit Notion (R84)", () => {
  it("weigert niet-beheerders", async () => {
    const space = (await getSidebar(liv)).privateSpace!.space.id;
    await expect(startNotionImport(liv, { token: "x", source: IDS.root, targetSpaceId: space })).rejects.toBeInstanceOf(AccessError);
  });

  it("zet een werkplek met subpagina's, databases, kolommen, tabellen en bestanden over", async () => {
    const fixture = makeNotionFixture({ livEmail: liv.email, nikkiEmail: nikki.email });
    const space = (await getSidebar(liv)).privateSpace!.space.id;
    const { jobId, done } = await startNotionImport(
      admin,
      { token: "secret_test", source: `https://www.notion.so/Liv-${IDS.root.replace(/-/g, "")}`, targetSpaceId: space },
      { fetchImpl: fixture.fetchImpl, minIntervalMs: 0 },
    );
    await done;
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    expect(job.error).toBeNull();
    expect(job.status).toBe("klaar");
    expect(job.stats, job.log.join("\n")).toMatchObject({ paginas: 2, databases: 2, rijen: 3, bestanden: 1 });
    expect(job.log.join("\n")).toContain("gekoppelde databases");
    expect(job.log.join("\n")).toContain("table_of_contents");

    // Structuur
    const root = job.rootPageId!;
    // Alleen wat de import (als beheerder) heeft aangemaakt; Liv's eigen werkplek heeft ook een "Kalender en taken".
    const all = await db
      .select({ id: pages.id, title: pages.title, kind: pages.kind, parentId: pages.parentId, icon: pages.icon })
      .from(pages)
      .where(and(eq(pages.spaceId, space), eq(pages.createdBy, admin.id)));
    const byTitle = (t: string) => all.find((p) => p.title === t)!;
    expect(byTitle("Liv - Stage Workspace")).toMatchObject({ id: root, kind: "page", icon: "📸" });
    expect(byTitle("Planning (Opdrachten)").parentId).toBe(root);
    expect(byTitle("Kalender en taken")).toMatchObject({ kind: "database", parentId: root });
    expect(byTitle("Weekafsluiting")).toMatchObject({ kind: "row", parentId: byTitle("Kalender en taken").id });

    // Inhoud van de startpagina
    const rootText = await text(liv, root);
    for (const t of ["To Do", "Vul elke dag even je taken in", "Notities", "Planning (Opdrachten)", "Nikki", "Ricardo", "Teamlead Marketing", "Link naar ExitToys"]) {
      expect(rootText).toContain(t);
    }

    // De inline kalender staat als database-blok op de pagina, de niet-inline Notities als verwijzing.
    const state = await loadDoc(liv, root);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, fromBase64(state!));
    // Yjs schrijft namen in toString() soms in kleine letters; daarom hoofdletterongevoelig vergelijken.
    const xml = doc.getXmlFragment(FRAGMENT).toString().toLowerCase();
    expect(xml).toContain(`databaseid="${byTitle("Kalender en taken").id}"`);
    expect(xml).toContain("columnlist");
    expect(xml).toContain('checked="true"');
    expect(xml).toContain(`targetid="${nikki.id}"`); // @Nikki is een verwijzing naar de echte collega
    expect(rootText).toContain("Wie Functie Emailadres");

    // Database: velden, statusgroepen, waarden, personen op e-mail
    const kal = await getDatabase(liv, byTitle("Kalender en taken").id);
    const names = kal.schema.properties.map((p) => `${p.name}:${p.type}`);
    expect(names).toEqual(["Datum:date", "Status:status", "Tags:multiSelect", "Wie:person", "Tekst:text"]);
    const status = kal.schema.properties.find((p) => p.type === "status")!;
    expect(status.options!.map((o) => `${o.name}:${o.group}:${o.color}`)).toEqual(["Niet gestart:todo:gray", "Vastgelopen:doing:orange", "Completed:done:green"]);
    expect(kal.schema.views.map((v) => v.type)).toEqual(["table", "board", "calendar"]);
    const week = kal.rows.find((r) => r.title === "Weekafsluiting")!;
    const byName = (n: string) => kal.schema.properties.find((p) => p.name === n)!.id;
    expect(week.props[byName("Datum")]).toEqual({ start: "2026-08-28T16:00" });
    expect(week.props[byName("Status")]).toBe(status.options![1].id);
    expect(week.props[byName("Wie")]).toEqual([liv.id, nikki.id]);
    expect(week.props[byName("Tekst")]).toBe("Wie: Team. Doel: vrijmibo.");
    const shoot = kal.rows.find((r) => r.title === "DZC shoot")!;
    expect(shoot.props[byName("Datum")]).toEqual({ start: "2026-10-12", end: "2026-10-13" });
    expect(await text(liv, week.id)).toContain("Taart regelen");

    // Subpagina met lijsten en een callout
    const planText = await text(liv, byTitle("Planning (Opdrachten)").id);
    expect(planText).toContain("challenges bij lokale clubs?");
    expect(planText).toContain("💡 Onderdelen het hele jaar door");

    // Afbeelding is gedownload en hoort bij de pagina
    const [img] = await db.select().from(files).where(eq(files.pageId, root));
    expect(img).toMatchObject({ contentType: "image/png", size: 7 });

    // Vindbaar met zoeken, en vastgelegd in het inzagelog
    expect((await searchPages(liv, "Teamlead")).map((h) => h.id)).toContain(root);
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.action, "notion.import"), eq(auditLog.actorId, admin.id)));
    expect(logs.length).toBeGreaterThan(0);
  });

  it("meldt een duidelijk probleem bij een verkeerd token", async () => {
    const fixture = makeNotionFixture({ livEmail: liv.email, nikkiEmail: nikki.email });
    const space = (await getSidebar(liv)).privateSpace!.space.id;
    const { jobId, done } = await startNotionImport(admin, { token: "fout", source: IDS.root, targetSpaceId: space }, { fetchImpl: fixture.fetchImpl, minIntervalMs: 0 });
    await done;
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    expect(job.status).toBe("mislukt");
    expect(job.error).toContain("token");
  });
});
