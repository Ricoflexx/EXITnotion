/**
 * Rechtenmodel van Homebase. Pure functies zonder database, zodat ze los te testen zijn.
 *
 * Regels:
 * 1. In je eigen privé-ruimte heb je volledige rechten.
 * 2. In een teamruimte heb je het niveau van je lidmaatschap.
 * 3. Een gedeelde pagina (grant) geeft rechten op die pagina én alle subpagina's.
 * 4. Het hoogste niveau uit 1 t/m 3 telt.
 * 5. Een beheerder mag alles lezen (R03). Lukt dat alleen via de beheerdersrol, dan is `viaAdmin` true
 *    en moet de inzage gelogd worden (R93). Bewerken via de beheerdersrol kan niet.
 * 6. Een gedeactiveerde gebruiker heeft nergens rechten.
 */

export const LEVELS = ["none", "read", "comment", "edit", "full"] as const;
export type Level = (typeof LEVELS)[number];
export type GrantLevel = Exclude<Level, "none">;

export const LEVEL_LABELS: Record<Level, string> = {
  none: "Geen toegang",
  read: "Kan lezen",
  comment: "Kan reageren",
  edit: "Kan bewerken",
  full: "Volledige toegang",
};

export function rank(level: Level): number {
  return LEVELS.indexOf(level);
}

export function atLeast(level: Level, required: Level): boolean {
  return rank(level) >= rank(required);
}

export function maxLevel(...levels: (Level | null | undefined)[]): Level {
  let best: Level = "none";
  for (const l of levels) if (l && rank(l) > rank(best)) best = l;
  return best;
}

export interface AccessInput {
  user: { id: string; isAdmin: boolean; active: boolean };
  space: { kind: "private" | "team"; ownerId: string | null };
  /** Niveau als lid van de teamruimte, of null als geen lid. */
  membership: Level | null;
  /** Gedeelde rechten van deze gebruiker op de pagina zelf en op alle bovenliggende pagina's. */
  grants: Level[];
}

export interface AccessResult {
  level: Level;
  /** True als de gebruiker dit alleen mag zien omdat hij beheerder is. Inzage moet dan gelogd worden. */
  viaAdmin: boolean;
}

export function resolveAccess(input: AccessInput): AccessResult {
  const { user, space, membership, grants } = input;
  if (!user.active) return { level: "none", viaAdmin: false };

  const spaceLevel: Level =
    space.kind === "private" ? (space.ownerId === user.id ? "full" : "none") : (membership ?? "none");

  const normal = maxLevel(spaceLevel, ...grants);

  if (user.isAdmin && !atLeast(normal, "read")) return { level: "read", viaAdmin: true };
  return { level: normal, viaAdmin: false };
}

/** Wat je met een niveau mag. */
export const can = {
  read: (l: Level) => atLeast(l, "read"),
  comment: (l: Level) => atLeast(l, "comment"),
  edit: (l: Level) => atLeast(l, "edit"),
  /** Delen, verwijderen en verplaatsen. */
  manage: (l: Level) => atLeast(l, "full"),
};

/**
 * Een pagina verplaatsen (R52): volledige rechten op de pagina zelf, en bewerkrechten waar hij naartoe gaat.
 * Een pagina mag niet onder zichzelf of een eigen subpagina komen (`targetIsDescendant`).
 */
export function canMove(args: { pageLevel: Level; targetLevel: Level; targetIsDescendant: boolean }): boolean {
  return can.manage(args.pageLevel) && can.edit(args.targetLevel) && !args.targetIsDescendant;
}
