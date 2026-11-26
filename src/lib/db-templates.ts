/**
 * Sjablonen voor databases (R72). Gebaseerd op wat de stagiairs nu in Notion gebruiken:
 * Liv's "Kalender en taken", de To Do, de contentkalender van de Social Media Hub, Notities en Afgeronde projecten.
 * Elke aanroep maakt nieuwe ids, zodat twee databases uit hetzelfde sjabloon los van elkaar staan.
 */
import { newId, type DbSchema, type Option, type Property, type View } from "./db-model";

export const DB_TEMPLATES = ["leeg", "taken", "todo", "contentkalender", "notities", "projecten"] as const;
export type DbTemplate = (typeof DB_TEMPLATES)[number];
export const DB_TEMPLATE_LABELS: Record<DbTemplate, string> = {
  leeg: "Lege database",
  taken: "Kalender en taken",
  todo: "To Do",
  contentkalender: "Contentkalender",
  notities: "Notities",
  projecten: "Afgeronde projecten",
};

const opt = (name: string, color: Option["color"], group?: Option["group"]): Option => ({ id: newId("o"), name, color, ...(group ? { group } : {}) });
const prop = (name: string, type: Property["type"], options?: Option[]): Property => ({ id: newId("p"), name, type, ...(options ? { options } : {}) });
const view = (v: Omit<View, "id" | "filters" | "sorts"> & Partial<Pick<View, "filters" | "sorts">>): View => ({
  id: newId("v"),
  filters: [],
  sorts: [],
  ...v,
});

export function makeDbSchema(template: DbTemplate): DbSchema {
  switch (template) {
    case "taken": {
      const status = prop("Status", "status", [
        opt("Niet gestart", "gray", "todo"),
        opt("In progress", "orange", "doing"),
        opt("Vastgelopen", "red", "doing"),
        opt("Feedback afwachten", "yellow", "doing"),
        opt("Completed", "green", "done"),
      ]);
      const datum = prop("Datum", "date");
      const tags = prop("Tags", "multiSelect", []);
      const wie = prop("Wie", "person");
      const tekst = prop("Tekst", "text");
      return {
        properties: [datum, status, tags, wie, tekst],
        views: [
          view({ name: "Kalender", type: "calendar", dateProperty: datum.id, calendarRange: "week", showWeekends: false }),
          view({ name: "Tabel", type: "table", sorts: [{ property: datum.id, dir: "asc" }] }),
          view({ name: "Bord", type: "board", groupBy: status.id }),
        ],
      };
    }
    case "todo": {
      const status = prop("Status", "status", [opt("Te doen", "gray", "todo"), opt("Bezig", "blue", "doing"), opt("Klaar", "green", "done")]);
      const datum = prop("Datum", "date");
      const lijst = prop("Lijst", "select", [opt("Algemeen", "gray"), opt("Instagram", "pink"), opt("TikTok", "purple"), opt("School", "blue")]);
      return {
        properties: [status, datum, lijst],
        views: [
          view({
            name: "Vandaag",
            type: "table",
            filters: [
              { property: datum.id, op: "onOrBeforeToday" },
              { property: status.id, op: "notDone" },
            ],
            sorts: [{ property: datum.id, dir: "asc" }],
            visible: [status.id, lijst.id],
          }),
          view({ name: "Per lijst", type: "table", groupBy: lijst.id, filters: [{ property: status.id, op: "notDone" }] }),
          view({ name: "Bord", type: "board", groupBy: status.id }),
          view({ name: "Kalender", type: "calendar", dateProperty: datum.id, calendarRange: "week", showWeekends: false }),
        ],
      };
    }
    case "contentkalender": {
      const datum = prop("Datum", "date");
      const type = prop("Type", "select", [
        opt("Video", "blue"),
        opt("Post", "gray"),
        opt("Pinterest pin", "pink"),
        opt("Draaidag", "yellow"),
        opt("Campagne", "purple"),
        opt("E-mail", "orange"),
      ]);
      const platform = prop("Platform", "multiSelect", [
        opt("Instagram", "pink"),
        opt("TikTok", "gray"),
        opt("Facebook", "blue"),
        opt("Pinterest", "red"),
        opt("YouTube", "red"),
        opt("Linktree", "orange"),
        opt("E-mail", "brown"),
      ]);
      const status = prop("Status", "status", [
        opt("Concept", "gray", "todo"),
        opt("In productie", "yellow", "doing"),
        opt("Gepland", "blue", "doing"),
        opt("Live", "pink", "done"),
      ]);
      const thema = prop("Thema", "select", []);
      const notities = prop("Notities", "text");
      return {
        properties: [datum, type, platform, status, thema, notities],
        views: [
          view({ name: "Kalender", type: "calendar", dateProperty: datum.id, calendarRange: "month", showWeekends: true }),
          view({ name: "Alles", type: "table", sorts: [{ property: datum.id, dir: "asc" }] }),
          view({ name: "Per type", type: "table", groupBy: type.id, sorts: [{ property: datum.id, dir: "asc" }] }),
          view({ name: "Per status", type: "board", groupBy: status.id, sorts: [{ property: datum.id, dir: "asc" }] }),
        ],
      };
    }
    case "notities": {
      const cat = prop("Categorie", "select", [
        opt("Algemeen", "gray"),
        opt("Instagram", "pink"),
        opt("TikTok", "purple"),
        opt("Fotoshoots", "orange"),
        opt("School", "blue"),
        opt("Vergadering", "green"),
      ]);
      return {
        properties: [cat],
        views: [
          view({ name: "Alles", type: "table", sorts: [{ property: "title", dir: "asc" }] }),
          view({ name: "Per categorie", type: "board", groupBy: cat.id }),
        ],
      };
    }
    case "projecten": {
      const datum = prop("Datum afgerond", "date");
      const gevoel = prop("Hoe voelde het", "select", [opt("Top", "green"), opt("Goed", "blue"), opt("Wisselend", "yellow"), opt("Zwaar", "red")]);
      const groei = prop("Hoofdcategorie groei", "select", [
        opt("Communicatie", "pink"),
        opt("Zelfstandigheid", "orange"),
        opt("Creativiteit", "purple"),
        opt("Technische vaardigheid", "blue"),
        opt("Samenwerken", "green"),
        opt("Plannen", "yellow"),
        opt("Overig", "gray"),
      ]);
      const vertrouwen = prop("Zelfvertrouwen", "select", [
        opt("1 - Had veel hulp nodig", "red"),
        opt("2 - Had meer hulp nodig dan ik wilde", "orange"),
        opt("3 - Kon het met wat overleg", "yellow"),
        opt("4 - Deed het bijna zelfstandig", "blue"),
        opt("5 - Volledig zelfstandig en met vertrouwen", "green"),
      ]);
      const trots = prop("Trots op", "checkbox");
      const geleerd = prop("Wat heb je geleerd", "text");
      const moeilijk = prop("Wat vond je moeilijk", "text");
      return {
        properties: [datum, gevoel, groei, vertrouwen, trots, geleerd, moeilijk],
        views: [
          view({ name: "Afgeronde projecten", type: "table", sorts: [{ property: datum.id, dir: "desc" }] }),
          view({ name: "Waar zit de groei", type: "board", groupBy: groei.id }),
        ],
      };
    }
    case "leeg":
    default: {
      const tags = prop("Tags", "multiSelect", []);
      return { properties: [tags], views: [view({ name: "Tabel", type: "table" })] };
    }
  }
}
