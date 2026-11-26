import { describe, expect, it } from "vitest";
import { canMove, maxLevel, resolveAccess, type AccessInput } from "../src/lib/permissions";

const liv = { id: "liv", isAdmin: false, active: true };
const nikki = { id: "nikki", isAdmin: false, active: true };
const beheerder = { id: "admin", isAdmin: true, active: true };

const privateOfLiv = { kind: "private" as const, ownerId: "liv" };
const team = { kind: "team" as const, ownerId: null };

function input(partial: Partial<AccessInput>): AccessInput {
  return { user: liv, space: privateOfLiv, membership: null, grants: [], ...partial };
}

describe("resolveAccess", () => {
  it("geeft de eigenaar volledige rechten in de eigen privé-ruimte", () => {
    expect(resolveAccess(input({}))).toEqual({ level: "full", viaAdmin: false });
  });

  it("geeft een collega geen toegang tot andermans privé-ruimte", () => {
    expect(resolveAccess(input({ user: nikki }))).toEqual({ level: "none", viaAdmin: false });
  });

  it("geeft een collega toegang via een gedeelde (boven)liggende pagina", () => {
    expect(resolveAccess(input({ user: nikki, grants: ["comment"] })).level).toBe("comment");
    expect(resolveAccess(input({ user: nikki, grants: ["read", "edit"] })).level).toBe("edit");
  });

  it("gebruikt in een teamruimte het niveau van het lidmaatschap", () => {
    expect(resolveAccess(input({ user: nikki, space: team, membership: "edit" })).level).toBe("edit");
    expect(resolveAccess(input({ user: nikki, space: team, membership: null })).level).toBe("none");
  });

  it("neemt het hoogste niveau van lidmaatschap en gedeelde rechten", () => {
    expect(resolveAccess(input({ user: nikki, space: team, membership: "read", grants: ["full"] })).level).toBe("full");
  });

  it("laat een beheerder alles lezen, gemarkeerd als beheerdersinzage", () => {
    expect(resolveAccess(input({ user: beheerder }))).toEqual({ level: "read", viaAdmin: true });
  });

  it("geeft een beheerder via de beheerdersrol geen bewerkrechten", () => {
    expect(resolveAccess(input({ user: beheerder })).level).not.toBe("edit");
  });

  it("markeert een beheerder met normale rechten niet als beheerdersinzage", () => {
    expect(resolveAccess(input({ user: beheerder, space: team, membership: "edit" }))).toEqual({
      level: "edit",
      viaAdmin: false,
    });
  });

  it("geeft een gedeactiveerde gebruiker nergens toegang, ook niet als eigenaar of beheerder", () => {
    expect(resolveAccess(input({ user: { ...liv, active: false } })).level).toBe("none");
    expect(resolveAccess(input({ user: { ...beheerder, active: false } })).level).toBe("none");
  });
});

describe("maxLevel", () => {
  it("negeert lege waarden", () => {
    expect(maxLevel(null, undefined, "read")).toBe("read");
    expect(maxLevel()).toBe("none");
  });
});

describe("canMove", () => {
  it("vereist volledige rechten op de pagina en bewerkrechten op de bestemming", () => {
    expect(canMove({ pageLevel: "full", targetLevel: "edit", targetIsDescendant: false })).toBe(true);
    expect(canMove({ pageLevel: "edit", targetLevel: "edit", targetIsDescendant: false })).toBe(false);
    expect(canMove({ pageLevel: "full", targetLevel: "comment", targetIsDescendant: false })).toBe(false);
  });

  it("weigert een pagina onder zijn eigen subpagina te zetten", () => {
    expect(canMove({ pageLevel: "full", targetLevel: "full", targetIsDescendant: true })).toBe(false);
  });
});
