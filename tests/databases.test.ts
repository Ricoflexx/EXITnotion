import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pages, users } from "@/db/schema";
import { AccessError, getSidebar, sharePage, upsertUserFromLogin, type CurrentUser } from "@/lib/access";
import {
  completeTask,
  createDatabase,
  createRow,
  deleteRow,
  getDatabase,
  myTasks,
  quickAddTodo,
  rescheduleTask,
  saveSchema,
  updateRow,
} from "@/lib/databases";
import { dayKey, addDays } from "@/lib/db-model";

const stamp = Date.now();
let liv: CurrentUser, nikki: CurrentUser;
const cu = (u: CurrentUser) => ({ id: u.id, isAdmin: u.isAdmin, active: u.active, name: u.name, email: u.email });
const today = dayKey(new Date());

beforeAll(async () => {
  liv = cu(await upsertUserFromLogin({ entraOid: `db-liv-${stamp}`, email: `db-liv-${stamp}@test.local`, name: "Liv" }));
  nikki = cu(await upsertUserFromLogin({ entraOid: `db-nikki-${stamp}`, email: `db-nikki-${stamp}@test.local`, name: "Nikki" }));
});

const privateSpace = async (u: CurrentUser) => (await getSidebar(u)).privateSpace!;

describe("stagiair-werkplek (R10)", () => {
  it("richt bij de eerste login een werkplek in met To Do, kalender, notities en meer", async () => {
    const titles = (await privateSpace(liv)).pages.map((p) => p.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Mijn werkplek", "To Do", "Kalender en taken", "Notities", "Afgeronde projecten", "Tips en tricks", "Logboek"]),
    );
    const [me] = await db.select({ todo: users.todoPageId }).from(users).where(eq(users.id, liv.id));
    expect(me.todo).toBeTruthy();
  });

  it("doet dat maar één keer", async () => {
    await upsertUserFromLogin({ entraOid: `db-liv-${stamp}`, email: `db-liv-${stamp}@test.local`, name: "Liv" });
    const titles = (await privateSpace(liv)).pages.map((p) => p.title);
    expect(titles.filter((t) => t === "Mijn werkplek")).toHaveLength(1);
  });

  it("zet de werkplek bovenaan, zodat je daar na het inloggen begint", async () => {
    const roots = (await privateSpace(liv)).pages.filter((p) => !p.parentId);
    expect(roots[0].title).toBe("Mijn werkplek");
  });
});

describe("databases en rijen (R30–R34)", () => {
  it("maakt een database met rijen; rijen staan niet in de zijbalk", async () => {
    const space = await privateSpace(liv);
    const { id } = await createDatabase(liv, { spaceId: space.space.id }, { title: "Contentkalender", template: "contentkalender" });
    const row = await createRow(liv, id, { title: "Kerstvideo" });
    const data = await getDatabase(liv, id);
    expect(data.rows.map((r) => r.title)).toEqual(["Kerstvideo"]);
    expect(data.schema.views.map((v) => v.name)).toEqual(["Kalender", "Alles", "Per type", "Per status"]);
    const status = data.schema.properties.find((p) => p.type === "status")!;
    expect(row.props[status.id]).toBe(status.options![0].id); // standaard: Concept
    expect((await privateSpace(liv)).pages.map((p) => p.id)).not.toContain(row.id);
  });

  it("negeert ongeldige waarden en onbekende velden", async () => {
    const space = await privateSpace(liv);
    const { id } = await createDatabase(liv, { spaceId: space.space.id }, { template: "taken" });
    const data = await getDatabase(liv, id);
    const datum = data.schema.properties.find((p) => p.type === "date")!;
    const row = await createRow(liv, id, { title: "x", props: { [datum.id]: { start: "morgen" }, verzonnen: 1 } });
    expect(row.props[datum.id]).toBeNull();
    expect("verzonnen" in row.props).toBe(false);
  });

  it("laat alleen wie mag bewerken rijen en velden aanpassen", async () => {
    const space = await privateSpace(liv);
    const { id } = await createDatabase(liv, { spaceId: space.space.id }, { title: "Gedeeld", template: "taken" });
    const row = await createRow(liv, id, { title: "Taak" });
    await sharePage(liv, id, nikki.id, "read");
    const asNikki = await getDatabase(nikki, id);
    expect(asNikki.canEdit).toBe(false);
    await expect(updateRow(nikki, row.id, { title: "Hack" })).rejects.toBeInstanceOf(AccessError);
    await expect(saveSchema(nikki, id, asNikki.schema)).rejects.toBeInstanceOf(AccessError);
    await expect(createRow(nikki, id, { title: "Nee" })).rejects.toBeInstanceOf(AccessError);

    await sharePage(liv, id, nikki.id, "edit");
    await updateRow(nikki, row.id, { title: "Aangepast door Nikki" });
    expect((await getDatabase(liv, id)).rows[0].title).toBe("Aangepast door Nikki");
  });

  it("weigert een ongeldig schema", async () => {
    const space = await privateSpace(liv);
    const { id } = await createDatabase(liv, { spaceId: space.space.id });
    await expect(saveSchema(liv, id, { properties: [], views: [] })).rejects.toThrow();
  });

  it("zet een verwijderde rij in de prullenbak", async () => {
    const space = await privateSpace(liv);
    const { id } = await createDatabase(liv, { spaceId: space.space.id });
    const row = await createRow(liv, id, { title: "Weg" });
    await deleteRow(liv, row.id);
    expect((await getDatabase(liv, id)).rows).toHaveLength(0);
    const [r] = await db.select({ deletedAt: pages.deletedAt }).from(pages).where(eq(pages.id, row.id));
    expect(r.deletedAt).not.toBeNull();
  });
});

describe("Mijn taken en To Do (R35, R36)", () => {
  it("toont eigen To Do-taken en taken waar je bij staat, zonder afgeronde", async () => {
    const mine = await quickAddTodo(liv, `Pinterest pins ${stamp}`, today);
    const space = await privateSpace(nikki);
    const { id } = await createDatabase(nikki, { spaceId: space.space.id }, { title: "Teamtaken", template: "taken" });
    await sharePage(nikki, id, liv.id, "edit");
    const data = await getDatabase(nikki, id);
    const wie = data.schema.properties.find((p) => p.type === "person")!;
    const assigned = await createRow(nikki, id, { title: `Shoot voorbereiden ${stamp}`, props: { [wie.id]: [liv.id] } });
    await createRow(nikki, id, { title: `Niet voor Liv ${stamp}` });

    const titles = (await myTasks(liv)).map((t) => t.title);
    expect(titles).toContain(`Pinterest pins ${stamp}`);
    expect(titles).toContain(`Shoot voorbereiden ${stamp}`);
    expect(titles).not.toContain(`Niet voor Liv ${stamp}`);

    await completeTask(liv, assigned.id);
    expect((await myTasks(liv)).map((t) => t.id)).not.toContain(assigned.id);
    expect((await myTasks(liv)).find((t) => t.id === mine.id)?.day).toBe(today);
  });

  it("schuift een taak door naar morgen en houdt de tijd", async () => {
    const t = await quickAddTodo(liv, `Doorschuiven ${stamp}`, today);
    await rescheduleTask(liv, t.id, addDays(today, 1));
    expect((await myTasks(liv)).find((x) => x.id === t.id)?.day).toBe(addDays(today, 1));
  });

  it("laat een collega jouw To Do niet aanpassen", async () => {
    const t = await quickAddTodo(liv, `Privé taak ${stamp}`, today);
    await expect(completeTask(nikki, t.id)).rejects.toBeInstanceOf(AccessError);
    expect((await myTasks(nikki)).map((x) => x.id)).not.toContain(t.id);
  });
});
