/**
 * Databases (R30–R34): velden, weergaven, filteren, sorteren en groeperen.
 * Pure functies zonder database of React, zodat ze in de browser én op de server werken en los te testen zijn.
 *
 * Een database is een pagina (kind "database") met een schema: een lijst velden en een lijst weergaven.
 * Elke rij is een pagina (kind "row") onder de database, met waarden per veld-id in `props`.
 * De titel van een rij is de paginatitel; die is geen apart veld.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------------------------
// Velden
// ---------------------------------------------------------------------------------------------

export const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type Color = (typeof COLORS)[number];
export const COLOR_LABELS: Record<Color, string> = {
  gray: "Grijs",
  brown: "Bruin",
  orange: "Oranje",
  yellow: "Geel",
  green: "Groen",
  blue: "Blauw",
  purple: "Paars",
  pink: "Roze",
  red: "Rood",
};

/** Statusgroepen, zoals in Notion: wat telt als "klaar" bepaalt Mijn taken. */
export const STATUS_GROUPS = ["todo", "doing", "done"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];
export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = { todo: "Te doen", doing: "Bezig", done: "Klaar" };

export const PROPERTY_TYPES = ["text", "number", "select", "multiSelect", "status", "date", "person", "checkbox", "url"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  text: "Tekst",
  number: "Getal",
  select: "Keuze",
  multiSelect: "Meerkeuze",
  status: "Status",
  date: "Datum",
  person: "Persoon",
  checkbox: "Vinkje",
  url: "Link",
};

const id = z.string().min(1).max(40);
const optionSchema = z.object({
  id,
  name: z.string().max(100),
  color: z.enum(COLORS),
  group: z.enum(STATUS_GROUPS).optional(),
});
export type Option = z.infer<typeof optionSchema>;

const propertySchema = z.object({
  id,
  name: z.string().max(100),
  type: z.enum(PROPERTY_TYPES),
  options: z.array(optionSchema).max(200).optional(),
});
export type Property = z.infer<typeof propertySchema>;

// ---------------------------------------------------------------------------------------------
// Weergaven
// ---------------------------------------------------------------------------------------------

export const VIEW_TYPES = ["table", "board", "calendar"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];
export const VIEW_TYPE_LABELS: Record<ViewType, string> = { table: "Tabel", board: "Bord", calendar: "Kalender" };

export const FILTER_OPS = [
  "contains",
  "notContains",
  "is",
  "isNot",
  "isEmpty",
  "isNotEmpty",
  "eq",
  "gt",
  "lt",
  "checked",
  "unchecked",
  "today",
  "overdue",
  "next7",
  "thisWeek",
  "onOrBeforeToday",
  "isMe",
  "notDone",
  "done",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

const filterSchema = z.object({
  /** Veld-id, of "title". */
  property: id,
  op: z.enum(FILTER_OPS),
  value: z.unknown().optional(),
});
export type Filter = z.infer<typeof filterSchema>;

const sortSchema = z.object({ property: id, dir: z.enum(["asc", "desc"]) });
export type Sort = z.infer<typeof sortSchema>;

const viewSchema = z.object({
  id,
  name: z.string().max(60),
  type: z.enum(VIEW_TYPES),
  filters: z.array(filterSchema).max(10).default([]),
  sorts: z.array(sortSchema).max(5).default([]),
  /** Tabel: optioneel groeperen. Bord: verplicht (keuze, status, persoon of vinkje). */
  groupBy: id.nullable().optional(),
  /** Kalender: welk datumveld. */
  dateProperty: id.nullable().optional(),
  calendarRange: z.enum(["week", "month"]).optional(),
  showWeekends: z.boolean().optional(),
  /** Zichtbare velden, in volgorde. Leeg/afwezig = alle velden. */
  visible: z.array(id).max(50).optional(),
});
export type View = z.infer<typeof viewSchema>;

export const dbSchemaSchema = z.object({
  properties: z.array(propertySchema).max(50),
  views: z.array(viewSchema).min(1).max(20),
});
export type DbSchema = z.infer<typeof dbSchemaSchema>;

// ---------------------------------------------------------------------------------------------
// Waarden
// ---------------------------------------------------------------------------------------------

export interface DateValue {
  /** "2026-12-03" of "2026-12-03T10:00" (lokale tijd). */
  start: string;
  end?: string | null;
}

export type PropValue = string | number | boolean | string[] | DateValue | null;
export type Props = Record<string, PropValue>;

export interface Row {
  id: string;
  title: string;
  props: Props;
  createdAt: string;
  updatedAt: string;
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/);

/** Controleert en normaliseert een waarde voor een veld. Ongeldige waarden worden null. */
export function cleanValue(property: Property, value: unknown): PropValue {
  const optionIds = new Set((property.options ?? []).map((o) => o.id));
  switch (property.type) {
    case "text":
    case "url":
      return typeof value === "string" ? value.slice(0, 5000) : null;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    case "checkbox":
      return value === true;
    case "select":
    case "status":
      return typeof value === "string" && optionIds.has(value) ? value : null;
    case "multiSelect":
      return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && optionIds.has(v)))] : [];
    case "person":
      return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string"))].slice(0, 20) : [];
    case "date": {
      const v = value as DateValue | null;
      if (!v || !dateString.safeParse(v.start).success) return null;
      const end = v.end && dateString.safeParse(v.end).success ? v.end : null;
      return end ? { start: v.start, end } : { start: v.start };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Datums (alles in lokale kalenderdagen "JJJJ-MM-DD")
// ---------------------------------------------------------------------------------------------

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
export function dayOf(value: PropValue): string | null {
  const v = value as DateValue | null;
  return v && typeof v === "object" && "start" in v ? v.start.slice(0, 10) : null;
}
/** Maandag van de week waarin `day` valt. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (date.getDay() + 6) % 7;
  return addDays(day, -offset);
}

// ---------------------------------------------------------------------------------------------
// Filteren, sorteren, groeperen
// ---------------------------------------------------------------------------------------------

export interface Context {
  /** Vandaag, als "JJJJ-MM-DD". */
  today: string;
  /** Id van de ingelogde gebruiker, voor "ben ik". */
  me: string;
}

function valueOf(row: Row, property: string): PropValue {
  return property === "title" ? row.title : (row.props[property] ?? null);
}

function isEmpty(v: PropValue): boolean {
  return v === null || v === "" || (Array.isArray(v) && v.length === 0) || v === false;
}

export function statusGroupOf(property: Property | undefined, value: PropValue): StatusGroup | null {
  if (!property || property.type !== "status" || typeof value !== "string") return null;
  return property.options?.find((o) => o.id === value)?.group ?? null;
}

export function matches(row: Row, filter: Filter, schema: DbSchema, ctx: Context): boolean {
  const v = valueOf(row, filter.property);
  const prop = schema.properties.find((p) => p.id === filter.property);
  const needle = typeof filter.value === "string" ? filter.value.toLowerCase() : filter.value;
  const day = dayOf(v);
  switch (filter.op) {
    case "isEmpty":
      return isEmpty(v);
    case "isNotEmpty":
      return !isEmpty(v);
    case "contains":
      if (Array.isArray(v)) return v.includes(filter.value as string);
      return typeof v === "string" && typeof needle === "string" && v.toLowerCase().includes(needle);
    case "notContains":
      if (Array.isArray(v)) return !v.includes(filter.value as string);
      return !(typeof v === "string" && typeof needle === "string" && v.toLowerCase().includes(needle));
    case "is":
      return v === filter.value;
    case "isNot":
      return v !== filter.value;
    case "eq":
      return typeof v === "number" && v === Number(filter.value);
    case "gt":
      return typeof v === "number" && v > Number(filter.value);
    case "lt":
      return typeof v === "number" && v < Number(filter.value);
    case "checked":
      return v === true;
    case "unchecked":
      return v !== true;
    case "today":
      return day === ctx.today;
    case "overdue":
      return day !== null && day < ctx.today;
    case "onOrBeforeToday":
      return day !== null && day <= ctx.today;
    case "next7":
      return day !== null && day >= ctx.today && day <= addDays(ctx.today, 7);
    case "thisWeek": {
      const start = weekStart(ctx.today);
      return day !== null && day >= start && day <= addDays(start, 6);
    }
    case "isMe":
      return Array.isArray(v) && v.includes(ctx.me);
    case "notDone":
      return statusGroupOf(prop, v) !== "done";
    case "done":
      return statusGroupOf(prop, v) === "done";
  }
}

function sortKey(row: Row, property: string, schema: DbSchema): string | number {
  const v = valueOf(row, property);
  const prop = schema.properties.find((p) => p.id === property);
  if (prop && (prop.type === "select" || prop.type === "status")) {
    // Op de volgorde van de keuzes, niet alfabetisch.
    const i = prop.options?.findIndex((o) => o.id === v) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  }
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.join(",");
  if (v && typeof v === "object") return v.start;
  return (v ?? "").toString().toLowerCase();
}

export function applyView(rows: Row[], view: View, schema: DbSchema, ctx: Context): Row[] {
  let out = rows.filter((r) => view.filters.every((f) => matches(r, f, schema, ctx)));
  if (view.sorts.length) {
    out = [...out].sort((a, b) => {
      for (const s of view.sorts) {
        const ka = sortKey(a, s.property, schema);
        const kb = sortKey(b, s.property, schema);
        // Lege waarden altijd onderaan.
        const ea = ka === "" ? 1 : 0;
        const eb = kb === "" ? 1 : 0;
        if (ea !== eb) return ea - eb;
        if (ka < kb) return s.dir === "asc" ? -1 : 1;
        if (ka > kb) return s.dir === "asc" ? 1 : -1;
      }
      return 0;
    });
  }
  return out;
}

export interface Group {
  /** Optie-id, gebruiker-id, "true"/"false", of "" voor "leeg". */
  key: string;
  label: string;
  color: Color;
  rows: Row[];
}

/** Velden waarop een bord of tabel gegroepeerd kan worden. */
export function groupableProperties(schema: DbSchema): Property[] {
  return schema.properties.filter((p) => ["select", "status", "person", "checkbox", "multiSelect"].includes(p.type));
}

export function groupRows(rows: Row[], property: Property, people: Record<string, string> = {}): Group[] {
  if (property.type === "checkbox") {
    return [
      { key: "false", label: "Niet aangevinkt", color: "gray", rows: rows.filter((r) => r.props[property.id] !== true) },
      { key: "true", label: "Aangevinkt", color: "green", rows: rows.filter((r) => r.props[property.id] === true) },
    ];
  }
  if (property.type === "person") {
    const keys = new Set<string>();
    rows.forEach((r) => ((r.props[property.id] as string[] | null) ?? []).forEach((k) => keys.add(k)));
    const groups: Group[] = [...keys].map((k) => ({
      key: k,
      label: people[k] ?? "Onbekend",
      color: "blue",
      rows: rows.filter((r) => ((r.props[property.id] as string[] | null) ?? []).includes(k)),
    }));
    groups.push({ key: "", label: "Niemand", color: "gray", rows: rows.filter((r) => isEmpty(r.props[property.id] ?? null)) });
    return groups;
  }
  const multi = property.type === "multiSelect";
  const groups: Group[] = (property.options ?? []).map((o) => ({
    key: o.id,
    label: o.name,
    color: o.color,
    rows: rows.filter((r) => (multi ? ((r.props[property.id] as string[] | null) ?? []).includes(o.id) : r.props[property.id] === o.id)),
  }));
  groups.unshift({
    key: "",
    label: `Geen ${property.name.toLowerCase()}`,
    color: "gray",
    rows: rows.filter((r) => isEmpty(r.props[property.id] ?? null) || (!multi && !property.options?.some((o) => o.id === r.props[property.id]))),
  });
  return groups;
}

/** De waarde die een rij krijgt als je hem naar een groep sleept (of daarin aanmaakt). */
export function valueForGroup(property: Property, key: string, current: PropValue): PropValue {
  if (property.type === "checkbox") return key === "true";
  if (property.type === "person" || property.type === "multiSelect") {
    if (!key) return [];
    const list = Array.isArray(current) ? current : [];
    return list.includes(key) ? list : [key];
  }
  return key || null;
}

// ---------------------------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------------------------

export function newId(prefix = ""): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix + rand.replace(/-/g, "").slice(0, 10);
}

export function firstOfType(schema: DbSchema, type: PropertyType): Property | undefined {
  return schema.properties.find((p) => p.type === type);
}

/** Startwaarden voor een nieuwe rij in een gefilterde weergave, zodat hij niet direct "verdwijnt". */
export function defaultsFromView(view: View, schema: DbSchema, ctx: Context): Props {
  const props: Props = {};
  for (const f of view.filters) {
    const prop = schema.properties.find((p) => p.id === f.property);
    if (!prop) continue;
    if (f.op === "is" && typeof f.value === "string") props[prop.id] = f.value;
    if (f.op === "checked") props[prop.id] = true;
    if ((f.op === "today" || f.op === "onOrBeforeToday" || f.op === "next7" || f.op === "thisWeek") && prop.type === "date")
      props[prop.id] = { start: ctx.today };
    if (f.op === "isMe") props[prop.id] = [ctx.me];
    if (f.op === "contains" && prop.type === "multiSelect" && typeof f.value === "string") props[prop.id] = [f.value];
  }
  return props;
}

/** Vult standaardwaarden aan: een status krijgt de eerste "te doen"-optie. */
export function withDefaults(schema: DbSchema, props: Props): Props {
  const out: Props = { ...props };
  for (const p of schema.properties) {
    if (p.type === "status" && !out[p.id]) {
      const first = p.options?.find((o) => o.group === "todo") ?? p.options?.[0];
      if (first) out[p.id] = first.id;
    }
  }
  return out;
}
