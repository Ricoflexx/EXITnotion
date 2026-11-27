"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  addDays,
  dayKey,
  dayOf,
  defaultsFromView,
  groupRows,
  valueForGroup,
  weekStart,
  type Context,
  type DateValue,
  type DbSchema,
  type Props,
  type Row,
  type View,
} from "@/lib/db-model";
import { Cell, Chip, ValueDisplay, formatDay, type People } from "./cells";
import { AddPropertyButton, PropertyHeader } from "./menus";
import type { DatabaseApi } from "./useDatabase";

export interface ViewProps {
  api: DatabaseApi;
  schema: DbSchema;
  view: View;
  rows: Row[];
  people: People;
  editable: boolean;
  ctx: Context;
}

const DRAG_TYPE = "application/x-homebase-row";

function visibleProps(schema: DbSchema, view: View) {
  const ids = view.visible ?? schema.properties.map((p) => p.id);
  return ids.map((id) => schema.properties.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
}

/** Invoerveld voor een nieuwe rij: Enter maakt hem aan, Escape annuleert. */
function NewRowInput({ onCreate, onCancel, placeholder = "Naam…" }: { onCreate: (title: string) => void; onCancel: () => void; placeholder?: string }) {
  const [title, setTitle] = useState("");
  return (
    <input
      className="cell-input new-row-input"
      autoFocus
      value={title}
      placeholder={placeholder}
      aria-label="Naam van de nieuwe rij"
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => (title.trim() ? onCreate(title.trim()) : onCancel())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (title.trim()) onCreate(title.trim());
          setTitle("");
        }
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

function TitleCell({ row, editable, onRename }: { row: Row; editable: boolean; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.title);
  return (
    <div className="title-cell">
      {editing ? (
        <input
          className="cell-input"
          autoFocus
          value={draft}
          aria-label="Naam"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft !== row.title) onRename(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(row.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <>
          <Link href={`/p/${row.id}`} className="row-link">{row.title || "Naamloos"}</Link>
          {editable && (
            <button type="button" className="icon-btn rename" aria-label={`${row.title || "Naamloos"} hernoemen`} onClick={() => { setDraft(row.title); setEditing(true); }}>
              ✎
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------------------------

export function TableView({ api, schema, view, rows, people, editable, ctx }: ViewProps) {
  const props = visibleProps(schema, view);
  const [adding, setAdding] = useState<string | null>(null);
  const groupProp = view.groupBy ? schema.properties.find((p) => p.id === view.groupBy) : undefined;
  const groups = groupProp ? groupRows(rows, groupProp, Object.fromEntries(people.map((p) => [p.id, p.name]))).filter((g) => g.rows.length || g.key) : null;

  const create = (title: string, extra: Props = {}) => {
    void api.addRow({ title, props: { ...defaultsFromView(view, schema, ctx), ...extra } });
  };

  const renderRows = (list: Row[]) =>
    list.map((row) => (
      <tr key={row.id}>
        <td className="col-title">
          <TitleCell row={row} editable={editable} onRename={(title) => api.updateRow(row.id, { title })} />
        </td>
        {props.map((p) => (
          <td key={p.id} className={`col-${p.type}`}>
            <Cell
              property={p}
              value={row.props[p.id] ?? null}
              people={people}
              editable={editable}
              onChange={(value) => api.updateRow(row.id, { props: { [p.id]: value } })}
              onCreateOption={(name) => api.createOption(p.id, name)}
            />
          </td>
        ))}
        <td className="col-actions">
          {editable && (
            <button type="button" className="icon-btn" aria-label={`${row.title || "Naamloos"} verwijderen`} title="Naar prullenbak" onClick={() => api.removeRow(row.id)}>
              🗑
            </button>
          )}
        </td>
      </tr>
    ));

  const addRowLine = (key: string, extra: Props = {}) =>
    editable && (
      <tr className="add-row">
        <td colSpan={props.length + 2}>
          {adding === key ? (
            <NewRowInput onCreate={(t) => create(t, extra)} onCancel={() => setAdding(null)} />
          ) : (
            <button type="button" className="btn ghost small" onClick={() => setAdding(key)}>+ Nieuw</button>
          )}
        </td>
      </tr>
    );

  return (
    <div className="tablewrap db-table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            <th className="col-title"><span className="th-label">Naam</span></th>
            {props.map((p) => (
              <th key={p.id}>
                <PropertyHeader property={p} schema={schema} view={view} editable={editable} onSave={api.saveSchema} />
              </th>
            ))}
            <th className="col-actions">{editable && <AddPropertyButton schema={schema} view={view} onSave={api.saveSchema} />}</th>
          </tr>
        </thead>
        {groups ? (
          groups.map((g) => (
            <tbody key={g.key}>
              <tr className="group-row">
                <td colSpan={props.length + 2}>
                  <Chip option={{ name: g.label, color: g.color }} /> <span className="muted">{g.rows.length}</span>
                </td>
              </tr>
              {renderRows(g.rows)}
              {addRowLine(`g:${g.key}`, groupProp ? { [groupProp.id]: valueForGroup(groupProp, g.key, null) } : {})}
            </tbody>
          ))
        ) : (
          <tbody>
            {renderRows(rows)}
            {addRowLine("all")}
          </tbody>
        )}
      </table>
      {!rows.length && !editable && <p className="muted empty-db">Nog niets hier.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Bord
// ---------------------------------------------------------------------------------------------

export function BoardView({ api, schema, view, rows, people, editable, ctx }: ViewProps) {
  const groupProp = schema.properties.find((p) => p.id === view.groupBy);
  const [adding, setAdding] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!groupProp) return <p className="muted empty-db">Kies bij Weergave ⚙ een veld (Keuze of Status) voor de kolommen.</p>;
  const groups = groupRows(rows, groupProp, Object.fromEntries(people.map((p) => [p.id, p.name]))).filter((g) => g.key || g.rows.length);
  const cardProps = visibleProps(schema, view).filter((p) => p.id !== groupProp.id);

  return (
    <div className="board">
      {groups.map((g) => (
        <section
          key={g.key}
          className={"board-col" + (over === g.key ? " drop-over" : "")}
          aria-label={g.label}
          onDragOver={(e) => {
            if (!editable || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.stopPropagation();
            setOver(g.key);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            const rowId = e.dataTransfer.getData(DRAG_TYPE);
            setOver(null);
            if (!rowId) return;
            e.preventDefault();
            e.stopPropagation();
            const row = rows.find((r) => r.id === rowId);
            if (row) api.updateRow(rowId, { props: { [groupProp.id]: valueForGroup(groupProp, g.key, row.props[groupProp.id] ?? null) } });
          }}
        >
          <header className="board-head">
            <Chip option={{ name: g.label, color: g.color }} /> <span className="muted">{g.rows.length}</span>
          </header>
          {g.rows.map((row) => (
            <article
              key={row.id}
              className="card"
              draggable={editable}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(DRAG_TYPE, row.id);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <Link href={`/p/${row.id}`} className="card-title" draggable={false}>{row.title || "Naamloos"}</Link>
              {cardProps.map((p) => {
                const v = row.props[p.id] ?? null;
                if (v === null || v === "" || v === false || (Array.isArray(v) && !v.length)) return null;
                return (
                  <div key={p.id} className="card-prop">
                    <ValueDisplay property={p} value={v} people={people} />
                  </div>
                );
              })}
            </article>
          ))}
          {editable &&
            (adding === g.key ? (
              <NewRowInput
                onCreate={(title) =>
                  void api.addRow({
                    title,
                    props: { ...defaultsFromView(view, schema, ctx), [groupProp.id]: valueForGroup(groupProp, g.key, null) },
                  })
                }
                onCancel={() => setAdding(null)}
              />
            ) : (
              <button type="button" className="btn ghost small" onClick={() => setAdding(g.key)}>+ Nieuw</button>
            ))}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Kalender
// ---------------------------------------------------------------------------------------------

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const MONTH_NAMES = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function weekNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function CalendarView({ api, schema, view, rows, editable, ctx }: ViewProps) {
  const dateProp = schema.properties.find((p) => p.id === view.dateProperty);
  const range = view.calendarRange ?? "month";
  const showWeekends = view.showWeekends !== false;
  const [anchor, setAnchor] = useState(ctx.today);
  const [adding, setAdding] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragging = useRef<string | null>(null);

  const days = useMemo(() => {
    let start: string;
    let count: number;
    if (range === "week") {
      start = weekStart(anchor);
      count = 7;
    } else {
      const first = anchor.slice(0, 8) + "01";
      start = weekStart(first);
      const [y, m] = anchor.split("-").map(Number);
      const last = dayKey(new Date(y, m, 0));
      const end = addDays(weekStart(last), 6);
      count = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
    }
    const all = Array.from({ length: count }, (_, i) => addDays(start, i));
    return showWeekends ? all : all.filter((_, i) => i % 7 < 5);
  }, [anchor, range, showWeekends]);

  if (!dateProp) return <p className="muted empty-db">Kies bij Weergave ⚙ een datumveld voor de kalender.</p>;

  const itemsOn = (day: string) =>
    rows.filter((r) => {
      const v = r.props[dateProp.id] as DateValue | null;
      if (!v) return false;
      const start = v.start.slice(0, 10);
      const end = v.end ? v.end.slice(0, 10) : start;
      return start <= day && day <= end;
    });
  const undated = rows.filter((r) => !dayOf(r.props[dateProp.id] ?? null)).length;

  const step = (dir: number) => {
    if (range === "week") setAnchor(addDays(anchor, 7 * dir));
    else {
      const [y, m] = anchor.split("-").map(Number);
      setAnchor(dayKey(new Date(y, m - 1 + dir, 1)));
    }
  };
  const [ay, am] = anchor.split("-").map(Number);
  const label = range === "week" ? `Week ${weekNumber(weekStart(anchor))} · ${MONTH_NAMES[am - 1]} ${ay}` : `${MONTH_NAMES[am - 1]} ${ay}`;

  const moveTo = (rowId: string, day: string) => {
    const row = rows.find((r) => r.id === rowId);
    const v = row?.props[dateProp.id] as DateValue | null;
    if (!row || !v) return;
    const oldDay = v.start.slice(0, 10);
    const shift = Math.round((new Date(day).getTime() - new Date(oldDay).getTime()) / 86400000);
    const move = (s: string) => addDays(s.slice(0, 10), shift) + s.slice(10);
    api.updateRow(rowId, { props: { [dateProp.id]: { start: move(v.start), ...(v.end ? { end: move(v.end) } : {}) } } });
  };

  const cols = showWeekends ? 7 : 5;
  return (
    <div className={`calendar cal-${range}`}>
      <div className="cal-bar">
        <strong className="cal-label">{label}</strong>
        <div className="row">
          <button type="button" className="btn ghost small" aria-label={range === "week" ? "Vorige week" : "Vorige maand"} onClick={() => step(-1)}>‹</button>
          <button type="button" className="btn ghost small" onClick={() => setAnchor(ctx.today)}>Vandaag</button>
          <button type="button" className="btn ghost small" aria-label={range === "week" ? "Volgende week" : "Volgende maand"} onClick={() => step(1)}>›</button>
        </div>
      </div>
      <div className="cal-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {WEEKDAYS.slice(0, cols).map((d) => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
        {days.map((day) => {
          const items = itemsOn(day);
          const inMonth = range === "week" || day.slice(5, 7) === anchor.slice(5, 7);
          return (
            <div
              key={day}
              className={"cal-day" + (day === ctx.today ? " today" : "") + (inMonth ? "" : " other-month") + (over === day ? " drop-over" : "")}
              onDragOver={(e) => {
                if (!editable || !dragging.current) return;
                e.preventDefault();
                e.stopPropagation();
                setOver(day);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOver(null);
                const id = e.dataTransfer.getData(DRAG_TYPE) || dragging.current;
                dragging.current = null;
                if (id) moveTo(id, day);
              }}
            >
              <div className="cal-date">
                <span>{Number(day.slice(8))}{range === "week" ? ` ${MONTH_NAMES[Number(day.slice(5, 7)) - 1].slice(0, 3)}` : ""}</span>
                {editable && (
                  <button type="button" className="icon-btn cal-add" aria-label={`Nieuw op ${formatDay(day)}`} onClick={() => setAdding(day)}>+</button>
                )}
              </div>
              {items.map((r) => {
                const v = r.props[dateProp.id] as DateValue;
                return (
                  <Link
                    key={r.id}
                    href={`/p/${r.id}`}
                    className="cal-item"
                    draggable={editable}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      dragging.current = r.id;
                      e.dataTransfer.setData(DRAG_TYPE, r.id);
                    }}
                    onDragEnd={() => (dragging.current = null)}
                  >
                    {v.start.length === 16 && v.start.slice(0, 10) === day && <span className="cal-time">{v.start.slice(11)}</span>}
                    {r.title || "Naamloos"}
                  </Link>
                );
              })}
              {adding === day && (
                <NewRowInput
                  onCreate={(title) => {
                    void api.addRow({ title, props: { ...defaultsFromView(view, schema, ctx), [dateProp.id]: { start: day } } });
                    setAdding(null);
                  }}
                  onCancel={() => setAdding(null)}
                />
              )}
            </div>
          );
        })}
      </div>
      {undated > 0 && <p className="muted cal-note">{undated} {undated === 1 ? "item heeft" : "items hebben"} geen datum en {undated === 1 ? "staat" : "staan"} niet in de kalender.</p>}
    </div>
  );
}
