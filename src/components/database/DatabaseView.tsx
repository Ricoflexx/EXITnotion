"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { applyView, dayKey, type Context } from "@/lib/db-model";
import type { DatabaseData } from "@/lib/databases";
import { AddViewButton, ViewSettings } from "./menus";
import { useDatabase } from "./useDatabase";
import { BoardView, CalendarView, TableView } from "./views";

const VIEW_KEY = (id: string) => `homebase:view:${id}`;

/**
 * Een database met weergaven (R30–R34). Wordt gebruikt als volledige pagina en als blok midden op een pagina (R12).
 */
export function DatabaseView({
  databaseId,
  initial,
  inline = false,
  initialViewId,
  me,
}: {
  databaseId: string;
  initial?: DatabaseData;
  inline?: boolean;
  initialViewId?: string;
  me: string;
}) {
  const api = useDatabase(databaseId, initial);
  const { data, error } = api;
  const [viewId, setViewId] = useState<string | undefined>(initialViewId);

  useEffect(() => {
    if (initialViewId) return;
    try {
      const stored = localStorage.getItem(VIEW_KEY(databaseId));
      if (stored) setViewId(stored);
    } catch {
      /* geen opslag beschikbaar */
    }
  }, [databaseId, initialViewId]);

  const ctx: Context = useMemo(() => ({ today: dayKey(new Date()), me }), [me]);
  const view = data?.schema.views.find((v) => v.id === viewId) ?? data?.schema.views[0];
  const rows = useMemo(() => (data && view ? applyView(data.rows, view, data.schema, ctx) : []), [data, view, ctx]);

  const choose = (id: string) => {
    setViewId(id);
    try {
      localStorage.setItem(VIEW_KEY(databaseId), id);
    } catch {
      /* geen opslag beschikbaar */
    }
  };

  if (!data || !view) {
    return (
      <div className={"db" + (inline ? " db-inline" : "")} contentEditable={false}>
        {error ? <p className="db-error">{error}</p> : <p className="muted">Database laden…</p>}
      </div>
    );
  }

  const props = { api, schema: data.schema, view, rows, people: data.people, editable: data.canEdit, ctx };
  return (
    <div
      className={"db" + (inline ? " db-inline" : "")}
      contentEditable={false}
      // In de editor: toetsen en plakken niet laten doorlopen naar de editor eromheen.
      onKeyDown={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
    >
      {inline && (
        <div className="db-inline-title">
          <Link href={`/p/${databaseId}`}>{data.title || "Naamloze database"}</Link>
        </div>
      )}
      <div className="db-bar">
        <div className="tabs" role="tablist" aria-label="Weergaven">
          {data.schema.views.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={v.id === view.id} className="tab" onClick={() => choose(v.id)}>
              {v.name}
            </button>
          ))}
          {data.canEdit && <AddViewButton schema={data.schema} onAdd={(s, id) => { void api.saveSchema(s); choose(id); }} />}
        </div>
        <span className="muted db-count">{rows.length} {rows.length === 1 ? "item" : "items"}</span>
        {data.canEdit && <ViewSettings schema={data.schema} view={view} people={data.people} onSave={api.saveSchema} />}
      </div>
      {error && (
        <p className="db-error" role="alert">
          {error} <button type="button" className="btn ghost small" onClick={() => api.setError(null)}>Sluiten</button>
        </p>
      )}
      {view.type === "table" && <TableView {...props} />}
      {view.type === "board" && <BoardView {...props} />}
      {view.type === "calendar" && <CalendarView {...props} />}
    </div>
  );
}
