/**
 * Notion → Homebase. Pure omzetfuncties: Notion-blokken naar editorblokken (BlockNote) en Notion-databases naar
 * ons databasemodel. Alles wat de buitenwereld raakt (bestanden, gebruikers, pagina-ids) komt binnen via `ConvertContext`.
 */
import { newId, type Color, type DbSchema, type Option, type Property, type Props, type StatusGroup, type View } from "../db-model";
import type { Json } from "./client";

export interface ConvertContext {
  /** Ons pagina-id bij een Notion-id, als die pagina ook geïmporteerd wordt. */
  pageId(notionId: string): string | null;
  /** Of een Notion-database inline (midden op de pagina) staat. */
  isInlineDatabase(notionId: string): boolean;
  /** Onze gebruiker bij een Notion-gebruiker (op e-mailadres), of null. */
  userId(user: Json): string | null;
  /** Slaat een bestand op dat bij Notion zelf staat; geeft onze URL terug, of null als het niet lukte. */
  storeFile(url: string, name: string): Promise<string | null>;
  /** Telt wat niet (volledig) mee kon, voor het importlog. */
  skip(what: string): void;
}

type Block = Record<string, unknown>;
type Inline = Record<string, unknown>;

const NOTION_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

export function mapColor(color: string | undefined): Color {
  return (NOTION_COLORS.includes(color ?? "") ? color : "gray") as Color;
}

export function plainText(rich: Json[] | undefined): string {
  return (rich ?? []).map((r) => r.plain_text ?? "").join("");
}

// ---------------------------------------------------------------------------------------------
// Tekst met opmaak
// ---------------------------------------------------------------------------------------------

function styles(a: Json | undefined): Record<string, unknown> {
  if (!a) return {};
  const s: Record<string, unknown> = {};
  if (a.bold) s.bold = true;
  if (a.italic) s.italic = true;
  if (a.strikethrough) s.strike = true;
  if (a.underline) s.underline = true;
  if (a.code) s.code = true;
  if (a.color && a.color !== "default") {
    const c = String(a.color);
    if (c.endsWith("_background")) s.backgroundColor = mapColor(c.replace("_background", ""));
    else s.textColor = mapColor(c);
  }
  return s;
}

export function richText(rich: Json[] | undefined, ctx: ConvertContext): Inline[] {
  const out: Inline[] = [];
  for (const r of rich ?? []) {
    const text = String(r.plain_text ?? "");
    const st = styles(r.annotations);
    if (r.type === "mention") {
      const m = r.mention ?? {};
      if (m.type === "page" || m.type === "database") {
        const target = ctx.pageId(m[m.type]?.id ?? "");
        if (target) {
          out.push({ type: "mention", props: { kind: "page", targetId: target, label: text || "Pagina" } });
          continue;
        }
      }
      if (m.type === "user") {
        const uid = ctx.userId(m.user ?? {});
        const name = text.replace(/^@/, "");
        if (uid) {
          out.push({ type: "mention", props: { kind: "person", targetId: uid, label: name } });
          continue;
        }
      }
      // Datums, links naar pagina's buiten de import, enz.: als gewone tekst (met link als die er is).
    }
    const href = r.href ?? r.text?.link?.url;
    const styled = { type: "text", text, styles: st };
    if (href && /^https?:\/\//i.test(href)) out.push({ type: "link", href, content: [styled] });
    else if (text) out.push(styled);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Blokken
// ---------------------------------------------------------------------------------------------

export interface NotionBlock extends Json {
  type: string;
  /** Kinderen, al opgehaald door de import (niet voor child_page/child_database). */
  children?: NotionBlock[];
}

function caption(b: Json): string {
  return plainText(b.caption);
}

async function fileBlock(kind: "image" | "file" | "video" | "audio", data: Json, ctx: ConvertContext): Promise<Block> {
  const name: string = data.name || caption(data) || kind;
  let url: string | null = null;
  if (data.type === "external") url = data.external?.url ?? null;
  else if (data.type === "file") url = await ctx.storeFile(data.file?.url, name || kind);
  if (!url) {
    ctx.skip("bestanden die niet gedownload konden worden");
    return { type: "paragraph", content: [{ type: "text", text: `[Bestand niet overgezet: ${name || kind}]`, styles: { italic: true } }] };
  }
  return { type: kind, props: { url, name: name || "", caption: caption(data) } };
}

export async function convertBlocks(blocks: NotionBlock[], ctx: ConvertContext): Promise<Block[]> {
  const out: Block[] = [];
  for (const b of blocks) out.push(...(await convertBlock(b, ctx)));
  return out;
}

async function convertBlock(b: NotionBlock, ctx: ConvertContext): Promise<Block[]> {
  const data = (b[b.type] ?? {}) as Json;
  // Kinderen pas omzetten als het bloktype ze gebruikt (kolommen en tabellen doen dat zelf).
  const kids = async () => (b.children?.length ? convertBlocks(b.children, ctx) : []);
  const withKids = async (block: Block): Promise<Block[]> => {
    const children = await kids();
    return [children.length ? { ...block, children } : block];
  };
  const color = (c?: string) => (c && c !== "default" ? (c.endsWith("_background") ? { backgroundColor: mapColor(c.replace("_background", "")) } : { textColor: mapColor(c) }) : {});
  const text = () => richText(data.rich_text, ctx);

  switch (b.type) {
    case "paragraph":
      return withKids({ type: "paragraph", props: color(data.color), content: text() });
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return withKids({
        type: "heading",
        props: { level: Number(b.type.slice(-1)), ...(data.is_toggleable ? { isToggleable: true } : {}), ...color(data.color) },
        content: text(),
      });
    case "bulleted_list_item":
      return withKids({ type: "bulletListItem", props: color(data.color), content: text() });
    case "numbered_list_item":
      return withKids({ type: "numberedListItem", props: color(data.color), content: text() });
    case "to_do":
      return withKids({ type: "checkListItem", props: { checked: Boolean(data.checked), ...color(data.color) }, content: text() });
    case "toggle":
      return withKids({ type: "toggleListItem", props: color(data.color), content: text() });
    case "quote":
      return withKids({ type: "quote", content: text() });
    case "callout": {
      const icon = data.icon?.type === "emoji" ? `${data.icon.emoji} ` : "";
      return withKids({ type: "quote", content: [...(icon ? [{ type: "text", text: icon, styles: {} }] : []), ...text()] });
    }
    case "code":
      return [{ type: "codeBlock", props: { language: String(data.language ?? "text").toLowerCase() }, content: plainText(data.rich_text) }];
    case "equation":
      return [{ type: "codeBlock", props: { language: "latex" }, content: String(data.expression ?? "") }];
    case "divider":
      return [{ type: "divider" }];
    case "image":
    case "video":
    case "audio":
      return [await fileBlock(b.type, data, ctx)];
    case "file":
    case "pdf":
      return [await fileBlock("file", data, ctx)];
    case "bookmark":
    case "embed":
    case "link_preview": {
      const url = String(data.url ?? "");
      const label = caption(data) || url;
      return url ? [{ type: "paragraph", content: [{ type: "link", href: url, content: [{ type: "text", text: label, styles: {} }] }] }] : [];
    }
    case "table": {
      const rows = (b.children ?? []).filter((r) => r.type === "table_row");
      if (!rows.length) return [];
      return [
        {
          type: "table",
          content: {
            type: "tableContent",
            ...(data.has_column_header ? { headerRows: 1 } : {}),
            ...(data.has_row_header ? { headerCols: 1 } : {}),
            rows: rows.map((r) => ({ cells: ((r.table_row as Json)?.cells ?? []).map((cell: Json[]) => richText(cell, ctx)) })),
          },
        },
      ];
    }
    case "column_list": {
      const cols = (b.children ?? []).filter((c) => c.type === "column");
      const converted: Block[] = [];
      for (const c of cols) {
        const kids = c.children?.length ? await convertBlocks(c.children, ctx) : [];
        const ratio = (c.column as Json)?.width_ratio;
        converted.push({
          type: "column",
          ...(typeof ratio === "number" ? { props: { width: ratio * cols.length } } : {}),
          children: kids.length ? kids : [{ type: "paragraph" }],
        });
      }
      return converted.length ? [{ type: "columnList", children: converted }] : [];
    }
    case "child_page":
    case "child_database": {
      const target = ctx.pageId(b.id as string);
      if (!target) return [];
      if (b.type === "child_database" && ctx.isInlineDatabase(b.id as string)) return [{ type: "database", props: { databaseId: target } }];
      return [{ type: "paragraph", content: [{ type: "mention", props: { kind: "page", targetId: target, label: data.title || "Naamloos" } }] }];
    }
    case "link_to_page": {
      const target = ctx.pageId(data.page_id ?? data.database_id ?? "");
      return target ? [{ type: "paragraph", content: [{ type: "mention", props: { kind: "page", targetId: target, label: "Pagina" } }] }] : [];
    }
    case "synced_block":
      return kids();
    case "table_of_contents":
    case "breadcrumb":
    case "template":
      ctx.skip(`blokken van het type ${b.type}`);
      return [];
    default:
      ctx.skip(`onbekende bloktypes (${b.type})`);
      return kids();
  }
}

/** Platte tekst van geconverteerde blokken, voor de titel van naamloze pagina's of controles. */
export function pageTitle(page: Json): string {
  const props = page.properties ?? {};
  for (const p of Object.values(props) as Json[]) if (p.type === "title") return plainText(p.title);
  return plainText(page.title);
}

// ---------------------------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------------------------

export interface DbMapping {
  schema: DbSchema;
  /** Notion-veldnaam → ons veld, plus hoe de waarde om te zetten. */
  fields: { notionName: string; notionType: string; property: Property }[];
  /** Notion-optie-id en -naam → onze optie-id, per veld. */
  options: Map<string, Map<string, string>>;
}

function statusGroupFor(name: string, index: number, total: number): StatusGroup {
  const n = name.toLowerCase();
  if (/complete|done|klaar|voltooid|afgerond/.test(n)) return "done";
  if (/progress|bezig|doing/.test(n)) return "doing";
  if (/to-?do|todo|te doen|niet gestart|not started/.test(n)) return "todo";
  return index === 0 ? "todo" : index === total - 1 ? "done" : "doing";
}

/** Velden die we als tekst bewaren (een momentopname), omdat ons model ze niet kent. */
const AS_TEXT = new Set(["email", "phone_number", "formula", "rollup", "unique_id", "place", "created_time", "last_edited_time", "created_by", "last_edited_by"]);

export function mapDatabase(db: Json, ctx: Pick<ConvertContext, "skip">): DbMapping {
  const fields: DbMapping["fields"] = [];
  const options = new Map<string, Map<string, string>>();
  for (const [name, def] of Object.entries(db.properties ?? {}) as [string, Json][]) {
    const t = def.type as string;
    if (t === "title") continue;
    let property: Property | null = null;
    const id = newId("p");
    const optMap = new Map<string, string>();
    const opts = (list: Json[] | undefined, group?: (o: Json, i: number) => StatusGroup): Option[] =>
      (list ?? []).map((o, i) => {
        const oid = newId("o");
        optMap.set(o.id, oid);
        optMap.set(`name:${o.name}`, oid);
        return { id: oid, name: String(o.name ?? ""), color: mapColor(o.color === "default" ? "gray" : o.color), ...(group ? { group: group(o, i) } : {}) };
      });

    if (t === "rich_text") property = { id, name, type: "text" };
    else if (t === "number") property = { id, name, type: "number" };
    else if (t === "select") property = { id, name, type: "select", options: opts(def.select?.options) };
    else if (t === "multi_select") property = { id, name, type: "multiSelect", options: opts(def.multi_select?.options) };
    else if (t === "status") {
      const groups = (def.status?.groups ?? []) as Json[];
      const groupOf = (o: Json, i: number): StatusGroup => {
        const gi = groups.findIndex((g) => (g.option_ids ?? []).includes(o.id));
        return gi >= 0 ? statusGroupFor(String(groups[gi].name ?? ""), gi, groups.length) : statusGroupFor(String(o.name ?? ""), i, def.status?.options?.length ?? 1);
      };
      property = { id, name, type: "status", options: opts(def.status?.options, groupOf) };
    } else if (t === "date") property = { id, name, type: "date" };
    else if (t === "people") property = { id, name, type: "person" };
    else if (t === "checkbox") property = { id, name, type: "checkbox" };
    else if (t === "url") property = { id, name, type: "url" };
    else if (AS_TEXT.has(t)) property = { id, name, type: "text" };
    else {
      ctx.skip(`databasevelden van het type ${t}`);
      continue;
    }
    fields.push({ notionName: name, notionType: t, property });
    if (optMap.size) options.set(id, optMap);
  }

  const properties = fields.map((f) => f.property);
  const date = properties.find((p) => p.type === "date");
  const board = properties.find((p) => p.type === "status") ?? properties.find((p) => p.type === "select");
  const views: View[] = [{ id: newId("v"), name: "Tabel", type: "table", filters: [], sorts: date ? [{ property: date.id, dir: "asc" }] : [] }];
  if (board) views.push({ id: newId("v"), name: "Bord", type: "board", filters: [], sorts: [], groupBy: board.id });
  if (date) views.push({ id: newId("v"), name: "Kalender", type: "calendar", filters: [], sorts: [], dateProperty: date.id, calendarRange: "month", showWeekends: true });
  return { schema: { properties, views }, fields, options };
}

/** "2026-08-28T14:00:00.000+02:00" → "2026-08-28T14:00" (lokale tijd zoals Notion hem toont). */
function notionDate(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.length > 10 ? s.slice(0, 16) : s.slice(0, 10);
}

function formulaText(v: Json | undefined): string {
  if (!v) return "";
  const inner = v[v.type];
  if (inner === null || inner === undefined) return "";
  if (typeof inner === "object" && "start" in inner) return [inner.start, inner.end].filter(Boolean).join(" → ");
  return String(inner);
}

export function mapRowProps(page: Json, mapping: DbMapping, ctx: Pick<ConvertContext, "userId">): Props {
  const props: Props = {};
  for (const f of mapping.fields) {
    const v = (page.properties ?? {})[f.notionName] as Json | undefined;
    if (!v) continue;
    const opt = mapping.options.get(f.property.id);
    const optionId = (o: Json | null | undefined) => (o ? (opt?.get(o.id) ?? opt?.get(`name:${o.name}`) ?? null) : null);
    switch (f.notionType) {
      case "rich_text":
        props[f.property.id] = plainText(v.rich_text);
        break;
      case "number":
        props[f.property.id] = typeof v.number === "number" ? v.number : null;
        break;
      case "select":
        props[f.property.id] = optionId(v.select);
        break;
      case "status":
        props[f.property.id] = optionId(v.status);
        break;
      case "multi_select":
        props[f.property.id] = ((v.multi_select ?? []) as Json[]).map(optionId).filter((x): x is string => Boolean(x));
        break;
      case "date": {
        const start = notionDate(v.date?.start);
        const end = notionDate(v.date?.end);
        props[f.property.id] = start ? (end ? { start, end } : { start }) : null;
        break;
      }
      case "people":
        props[f.property.id] = ((v.people ?? []) as Json[]).map((u) => ctx.userId(u)).filter((x): x is string => Boolean(x));
        break;
      case "checkbox":
        props[f.property.id] = v.checkbox === true;
        break;
      case "url":
        props[f.property.id] = v.url ?? null;
        break;
      case "email":
        props[f.property.id] = v.email ?? "";
        break;
      case "phone_number":
        props[f.property.id] = v.phone_number ?? "";
        break;
      case "formula":
        props[f.property.id] = formulaText(v.formula);
        break;
      case "rollup":
        props[f.property.id] = v.rollup?.type === "array" ? `${(v.rollup.array ?? []).length} items` : formulaText(v.rollup);
        break;
      case "unique_id":
        props[f.property.id] = v.unique_id ? `${v.unique_id.prefix ? v.unique_id.prefix + "-" : ""}${v.unique_id.number}` : "";
        break;
      case "place":
        props[f.property.id] = v.place?.address ?? v.place?.name ?? "";
        break;
      case "created_time":
      case "last_edited_time":
        props[f.property.id] = String(v[f.notionType] ?? "").slice(0, 16).replace("T", " ");
        break;
      case "created_by":
      case "last_edited_by":
        props[f.property.id] = v[f.notionType]?.name ?? "";
        break;
    }
  }
  return props;
}
