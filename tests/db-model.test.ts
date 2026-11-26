import { describe, expect, it } from "vitest";
import {
  addDays,
  applyView,
  cleanValue,
  defaultsFromView,
  groupRows,
  matches,
  valueForGroup,
  weekStart,
  withDefaults,
  type Row,
} from "../src/lib/db-model";
import { makeDbSchema } from "../src/lib/db-templates";

const ctx = { today: "2026-11-26", me: "liv" };
const schema = makeDbSchema("taken");
const [datum, status, tags, wie] = schema.properties;
const opt = (name: string) => status.options!.find((o) => o.name === name)!.id;

function row(title: string, props: Row["props"]): Row {
  return { id: title, title, props, createdAt: "", updatedAt: "" };
}

describe("datums", () => {
  it("telt dagen over maandgrenzen heen", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("vindt de maandag van de week", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23"); // donderdag → maandag
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // zondag hoort bij dezelfde week
  });
});

describe("cleanValue", () => {
  it("houdt alleen bestaande keuzes over", () => {
    expect(cleanValue(status, opt("Vastgelopen"))).toBe(opt("Vastgelopen"));
    expect(cleanValue(status, "bestaat-niet")).toBeNull();
  });
  it("controleert datums", () => {
    expect(cleanValue(datum, { start: "2026-12-03T10:00" })).toEqual({ start: "2026-12-03T10:00" });
    expect(cleanValue(datum, { start: "3 december" })).toBeNull();
  });
  it("maakt van lijsten unieke waarden", () => {
    expect(cleanValue(wie, ["liv", "liv", 3])).toEqual(["liv"]);
  });
});

describe("filters", () => {
  const rows = [
    row("Te laat", { [datum.id]: { start: "2026-11-20" }, [status.id]: opt("Niet gestart") }),
    row("Vandaag", { [datum.id]: { start: "2026-11-26T14:00" }, [status.id]: opt("In progress"), [wie.id]: ["liv"] }),
    row("Volgende week", { [datum.id]: { start: "2026-12-01" }, [status.id]: opt("Completed") }),
    row("Zonder datum", {}),
  ];
  const titles = (f: Parameters<typeof matches>[1]) => rows.filter((r) => matches(r, f, schema, ctx)).map((r) => r.title);

  it("vandaag, te laat, t/m vandaag en de komende 7 dagen", () => {
    expect(titles({ property: datum.id, op: "today" })).toEqual(["Vandaag"]);
    expect(titles({ property: datum.id, op: "overdue" })).toEqual(["Te laat"]);
    expect(titles({ property: datum.id, op: "onOrBeforeToday" })).toEqual(["Te laat", "Vandaag"]);
    expect(titles({ property: datum.id, op: "next7" })).toEqual(["Vandaag", "Volgende week"]);
  });
  it("niet klaar volgens de statusgroep", () => {
    expect(titles({ property: status.id, op: "notDone" })).toEqual(["Te laat", "Vandaag", "Zonder datum"]);
  });
  it("ben ik", () => {
    expect(titles({ property: wie.id, op: "isMe" })).toEqual(["Vandaag"]);
  });
  it("tekst bevat, ongeacht hoofdletters", () => {
    expect(titles({ property: "title", op: "contains", value: "WEEK" })).toEqual(["Volgende week"]);
  });
});

describe("applyView", () => {
  it("sorteert op datum met lege waarden onderaan", () => {
    const rows = [row("b", { [datum.id]: { start: "2026-12-02" } }), row("leeg", {}), row("a", { [datum.id]: { start: "2026-11-01" } })];
    const view = { ...schema.views[1], sorts: [{ property: datum.id, dir: "asc" as const }] };
    expect(applyView(rows, view, schema, ctx).map((r) => r.title)).toEqual(["a", "b", "leeg"]);
  });
  it("sorteert een status op de volgorde van de keuzes", () => {
    const rows = [row("klaar", { [status.id]: opt("Completed") }), row("nieuw", { [status.id]: opt("Niet gestart") })];
    const view = { ...schema.views[1], sorts: [{ property: status.id, dir: "asc" as const }] };
    expect(applyView(rows, view, schema, ctx).map((r) => r.title)).toEqual(["nieuw", "klaar"]);
  });
});

describe("groeperen (bord)", () => {
  it("maakt een kolom per keuze plus een kolom zonder waarde", () => {
    const groups = groupRows([row("x", { [status.id]: opt("Vastgelopen") }), row("y", {})], status);
    expect(groups.map((g) => g.label)).toEqual(["Geen status", "Niet gestart", "In progress", "Vastgelopen", "Feedback afwachten", "Completed"]);
    expect(groups.find((g) => g.label === "Vastgelopen")!.rows.map((r) => r.title)).toEqual(["x"]);
    expect(groups[0].rows.map((r) => r.title)).toEqual(["y"]);
  });
  it("zet bij slepen de juiste waarde", () => {
    expect(valueForGroup(status, opt("Completed"), null)).toBe(opt("Completed"));
    expect(valueForGroup(status, "", opt("Completed"))).toBeNull();
    expect(valueForGroup(tags, "", ["a"])).toEqual([]);
  });
});

describe("standaardwaarden", () => {
  it("geeft een nieuwe rij de eerste te-doen-status", () => {
    expect(withDefaults(schema, {})[status.id]).toBe(opt("Niet gestart"));
  });
  it("neemt filters van de weergave over, zodat een nieuwe rij zichtbaar blijft", () => {
    const todo = makeDbSchema("todo");
    const vandaag = todo.views[0];
    const datumId = todo.properties.find((p) => p.type === "date")!.id;
    expect(defaultsFromView(vandaag, todo, ctx)[datumId]).toEqual({ start: "2026-11-26" });
  });
});

describe("sjablonen", () => {
  it("maakt elke keer nieuwe ids", () => {
    expect(makeDbSchema("todo").properties[0].id).not.toBe(makeDbSchema("todo").properties[0].id);
  });
});
