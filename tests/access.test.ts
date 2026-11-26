import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, pages, spaces } from "@/db/schema";
import {
  AccessError,
  createPage,
  getPageAccess,
  getSidebar,
  listTrash,
  movePage,
  restorePage,
  sharePage,
  trashPage,
  upsertUserFromLogin,
  type CurrentUser,
} from "@/lib/access";
import { adminOverview, createTeamSpace, setTeamMember, setUserActive, transferWork } from "@/lib/admin";

let liv: CurrentUser, nikki: CurrentUser, beheerder: CurrentUser;
const asCurrent = (u: { id: string; isAdmin: boolean; active: boolean; name: string; email: string }): CurrentUser => ({
  id: u.id, isAdmin: u.isAdmin, active: u.active, name: u.name, email: u.email,
});
const stamp = Date.now();

beforeAll(async () => {
  liv = asCurrent(await upsertUserFromLogin({ entraOid: `liv-${stamp}`, email: `liv-${stamp}@test.local`, name: "Liv" }));
  nikki = asCurrent(await upsertUserFromLogin({ entraOid: `nikki-${stamp}`, email: `nikki-${stamp}@test.local`, name: "Nikki" }));
  beheerder = asCurrent(
    await upsertUserFromLogin({ entraOid: `admin-${stamp}`, email: `admin-${stamp}@test.local`, name: "Beheerder", isAdmin: true }),
  );
});

async function privateSpaceId(user: CurrentUser) {
  return (await getSidebar(user)).privateSpace!.space.id;
}

describe("privé-ruimte en delen", () => {
  it("maakt bij de eerste login een privé-ruimte met een welkomstpagina", async () => {
    const sidebar = await getSidebar(liv);
    expect(sidebar.privateSpace?.pages.map((p) => p.title)).toContain("Welkom in je werkplek");
  });

  it("laat een collega niet in andermans privé-pagina, tot die gedeeld wordt (ook subpagina's)", async () => {
    const plan = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "Contentplanning" });
    const sub = await createPage(liv, { parentId: plan.id, title: "Draaidagen" });
    await expect(getPageAccess(nikki, sub.id)).rejects.toBeInstanceOf(AccessError);

    await sharePage(liv, plan.id, nikki.id, "comment");
    const access = await getPageAccess(nikki, sub.id);
    expect(access.level).toBe("comment");
    expect((await getSidebar(nikki)).sharedWithMe.map((p) => p.id)).toContain(plan.id);
  });

  it("verbiedt delen zonder volledige rechten", async () => {
    const plan = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "Alleen lezen" });
    await sharePage(liv, plan.id, nikki.id, "edit");
    await expect(sharePage(nikki, plan.id, beheerder.id, "read")).rejects.toBeInstanceOf(AccessError);
  });
});

describe("beheerdersinzage (R03, R93)", () => {
  it("laat een beheerder een privé-pagina lezen en legt dat vast", async () => {
    const geheim = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "Privé notitie" });
    const access = await getPageAccess(beheerder, geheim.id);
    expect(access).toMatchObject({ level: "read", viaAdmin: true });
    const logs = await db.select().from(auditLog).where(eq(auditLog.pageId, geheim.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "beheerder.inzage", actorId: beheerder.id, subjectUserId: liv.id });
  });

  it("geeft een beheerder via de beheerdersrol geen bewerkrechten", async () => {
    const geheim = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "Niet aankomen" });
    await expect(createPage(beheerder, { parentId: geheim.id })).rejects.toBeInstanceOf(AccessError);
  });

  it("weigert een uitgezet account overal", async () => {
    const tijdelijk = asCurrent(
      await upsertUserFromLogin({ entraOid: `tmp-${stamp}`, email: `tmp-${stamp}@test.local`, name: "Tijdelijk" }),
    );
    const page = await createPage(tijdelijk, { spaceId: await privateSpaceId(tijdelijk) });
    await setUserActive(beheerder, tijdelijk.id, false);
    await expect(getPageAccess({ ...tijdelijk, active: false }, page.id)).rejects.toBeInstanceOf(AccessError);
  });
});

describe("teamruimtes, verplaatsen (R52) en overdragen (R81)", () => {
  it("verplaatst een pagina met subpagina's naar een teamruimte", async () => {
    const hub = await createTeamSpace(beheerder, `Social Media Hub ${stamp}`);
    await setTeamMember(beheerder, hub.id, liv.id, "edit");
    await setTeamMember(beheerder, hub.id, nikki.id, "edit");

    const idee = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "Idee kerstcampagne" });
    const sub = await createPage(liv, { parentId: idee.id, title: "Shotlist" });
    await movePage(liv, idee.id, { spaceId: hub.id });

    const [moved] = await db.select().from(pages).where(eq(pages.id, sub.id));
    expect(moved.spaceId).toBe(hub.id);
    expect((await getPageAccess(nikki, sub.id)).level).toBe("edit");
  });

  it("weigert een pagina onder zijn eigen subpagina te zetten", async () => {
    const a = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "A" });
    const b = await createPage(liv, { parentId: a.id, title: "B" });
    await expect(movePage(liv, a.id, { parentId: b.id })).rejects.toThrow(/eigen subpagina/);
  });

  it("telt leden en pagina's in het beheerdersoverzicht goed", async () => {
    const team = await createTeamSpace(beheerder, `Telling ${stamp}`);
    await setTeamMember(beheerder, team.id, liv.id, "read");
    const overview = await adminOverview(beheerder);
    expect(overview.teams.find((t) => t.id === team.id)?.members.map((m) => m.id)).toEqual([liv.id]);
    const livRow = overview.people.find((p) => p.id === liv.id)!;
    const [{ count }] = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from pages where space_id = ${livRow.privateSpaceId} and deleted_at is null`,
    );
    expect(livRow.pageCount).toBe(count);
  });

  it("draagt alle privé-pagina's over naar een teamruimte en zet het account uit", async () => {
    const vertrekker = asCurrent(
      await upsertUserFromLogin({ entraOid: `weg-${stamp}`, email: `weg-${stamp}@test.local`, name: "Vertrekker" }),
    );
    const sp = await privateSpaceId(vertrekker);
    const p1 = await createPage(vertrekker, { spaceId: sp, title: "Logboek" });
    await createPage(vertrekker, { parentId: p1.id, title: "Week 1" });
    const team = await createTeamSpace(beheerder, `Archief ${stamp}`);

    const result = await transferWork(beheerder, { fromUserId: vertrekker.id, toSpaceId: team.id, deactivate: true });
    expect(result.count).toBe(3); // welkomstpagina + 2
    const [container] = await db.select().from(pages).where(eq(pages.id, result.containerId));
    expect(container).toMatchObject({ title: "Werk van Vertrekker", spaceId: team.id });
    const [moved] = await db.select().from(pages).where(eq(pages.id, p1.id));
    expect(moved).toMatchObject({ spaceId: team.id, parentId: container.id });
    const [space] = await db.select().from(spaces).where(eq(spaces.id, sp));
    expect(space.kind).toBe("private");
  });
});

describe("prullenbak (R63)", () => {
  it("zet een pagina met subpagina's in de prullenbak en weer terug", async () => {
    const p = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "Weg ermee" });
    const sub = await createPage(liv, { parentId: p.id, title: "Ook weg" });
    await trashPage(liv, p.id);
    const sidebar = await getSidebar(liv);
    expect(sidebar.privateSpace!.pages.map((x) => x.id)).not.toContain(sub.id);
    expect((await listTrash(liv)).map((x) => x.id)).toEqual(expect.arrayContaining([p.id]));
    expect((await listTrash(liv)).map((x) => x.id)).not.toContain(sub.id);

    await restorePage(liv, p.id);
    const after = await getSidebar(liv);
    expect(after.privateSpace!.pages.map((x) => x.id)).toEqual(expect.arrayContaining([p.id, sub.id]));
  });

  it("laat alleen wie volledige rechten heeft iets weggooien", async () => {
    const p = await createPage(liv, { spaceId: await privateSpaceId(liv), title: "Gedeeld bewerken" });
    await sharePage(liv, p.id, nikki.id, "edit");
    await expect(trashPage(nikki, p.id)).rejects.toBeInstanceOf(AccessError);
  });
});
