"use client";

import { useState } from "react";
import {
  COLORS,
  COLOR_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  STATUS_GROUPS,
  STATUS_GROUP_LABELS,
  VIEW_TYPES,
  VIEW_TYPE_LABELS,
  groupableProperties,
  newId,
  type DbSchema,
  type Filter,
  type FilterOp,
  type Option,
  type Property,
  type PropertyType,
  type View,
} from "@/lib/db-model";
import { Popover } from "./Popover";
import type { People } from "./cells";

// ---------------------------------------------------------------------------------------------
// Velden
// ---------------------------------------------------------------------------------------------

export function AddPropertyButton({ schema, view, onSave }: { schema: DbSchema; view: View; onSave: (s: DbSchema) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  return (
    <Popover label="Veld toevoegen" trigger="+" triggerClassName="add-col" width={240} onClose={() => setName("")}>
      {(close) => (
        <form
          className="pop-form"
          onSubmit={(e) => {
            e.preventDefault();
            const prop: Property = {
              id: newId("p"),
              name: name.trim() || PROPERTY_TYPE_LABELS[type],
              type,
              ...(type === "select" || type === "multiSelect" ? { options: [] } : {}),
              ...(type === "status"
                ? {
                    options: [
                      { id: newId("o"), name: "Te doen", color: "gray", group: "todo" },
                      { id: newId("o"), name: "Bezig", color: "blue", group: "doing" },
                      { id: newId("o"), name: "Klaar", color: "green", group: "done" },
                    ] satisfies Option[],
                  }
                : {}),
            };
            // Ook zichtbaar maken in deze weergave als die een vaste lijst velden heeft.
            const views = schema.views.map((v) => (v.id === view.id && v.visible ? { ...v, visible: [...v.visible, prop.id] } : v));
            onSave({ ...schema, properties: [...schema.properties, prop], views });
            close();
          }}
        >
          <label>
            Naam
            <input className="pop-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Bijvoorbeeld Platform" />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as PropertyType)}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <button className="btn primary" type="submit">Toevoegen</button>
        </form>
      )}
    </Popover>
  );
}

export function PropertyHeader({
  property,
  schema,
  view,
  editable,
  onSave,
}: {
  property: Property;
  schema: DbSchema;
  view: View;
  editable: boolean;
  onSave: (s: DbSchema) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!editable) return <span className="th-label">{property.name}</span>;

  const update = (patch: Partial<Property>) =>
    onSave({ ...schema, properties: schema.properties.map((p) => (p.id === property.id ? { ...p, ...patch } : p)) });
  const updateOption = (id: string, patch: Partial<Option>) =>
    update({ options: (property.options ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const hasOptions = property.type === "select" || property.type === "multiSelect" || property.type === "status";

  return (
    <Popover label={`Veld ${property.name}`} trigger={<span className="th-label">{property.name}</span>} triggerClassName="th-button" width={300} onClose={() => setConfirmDelete(false)}>
      {(close) => (
        <div className="pop-form">
          <label>
            Naam
            <input className="pop-input" defaultValue={property.name} onBlur={(e) => e.target.value.trim() && update({ name: e.target.value.trim() })} />
          </label>
          <p className="muted pop-note">Type: {PROPERTY_TYPE_LABELS[property.type]}</p>
          {hasOptions && (
            <div className="opt-editor">
              <strong>Keuzes</strong>
              {(property.options ?? []).map((o) => (
                <div key={o.id} className="opt-edit-row">
                  <input className="pop-input" defaultValue={o.name} aria-label="Naam van de keuze" onBlur={(e) => e.target.value.trim() && updateOption(o.id, { name: e.target.value.trim() })} />
                  <select aria-label="Kleur" value={o.color} onChange={(e) => updateOption(o.id, { color: e.target.value as Option["color"] })}>
                    {COLORS.map((c) => <option key={c} value={c}>{COLOR_LABELS[c]}</option>)}
                  </select>
                  {property.type === "status" && (
                    <select aria-label="Groep" value={o.group ?? "todo"} onChange={(e) => updateOption(o.id, { group: e.target.value as Option["group"] })}>
                      {STATUS_GROUPS.map((g) => <option key={g} value={g}>{STATUS_GROUP_LABELS[g]}</option>)}
                    </select>
                  )}
                  <button type="button" className="icon-btn" aria-label={`Keuze ${o.name} verwijderen`} onClick={() => update({ options: (property.options ?? []).filter((x) => x.id !== o.id) })}>
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  update({
                    options: [
                      ...(property.options ?? []),
                      { id: newId("o"), name: "Nieuwe keuze", color: "gray", ...(property.type === "status" ? { group: "todo" as const } : {}) },
                    ],
                  })
                }
              >
                + Keuze
              </button>
              {property.type === "status" && <p className="muted pop-note">Keuzes in de groep &quot;Klaar&quot; tellen als afgerond in Mijn taken.</p>}
            </div>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const visible = (view.visible ?? schema.properties.map((p) => p.id)).filter((id) => id !== property.id);
              onSave({ ...schema, views: schema.views.map((v) => (v.id === view.id ? { ...v, visible } : v)) });
              close();
            }}
          >
            Verbergen in deze weergave
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onSave({
                properties: schema.properties.filter((p) => p.id !== property.id),
                views: schema.views.map((v) => ({
                  ...v,
                  filters: v.filters.filter((f) => f.property !== property.id),
                  sorts: v.sorts.filter((s) => s.property !== property.id),
                  groupBy: v.groupBy === property.id ? null : v.groupBy,
                  dateProperty: v.dateProperty === property.id ? null : v.dateProperty,
                  visible: v.visible?.filter((id) => id !== property.id),
                })),
              });
              close();
            }}
          >
            {confirmDelete ? "Zeker weten? Klik nog eens" : "Veld verwijderen"}
          </button>
        </div>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------------------------------------------
// Weergaven
// ---------------------------------------------------------------------------------------------

const OP_LABELS: Record<FilterOp, string> = {
  contains: "bevat",
  notContains: "bevat niet",
  is: "is",
  isNot: "is niet",
  isEmpty: "is leeg",
  isNotEmpty: "is niet leeg",
  eq: "is gelijk aan",
  gt: "is groter dan",
  lt: "is kleiner dan",
  checked: "is aangevinkt",
  unchecked: "is niet aangevinkt",
  today: "is vandaag",
  overdue: "is verlopen",
  next7: "in de komende 7 dagen",
  thisWeek: "is deze week",
  onOrBeforeToday: "is vandaag of eerder",
  isMe: "ben ik",
  notDone: "is niet klaar",
  done: "is klaar",
};

function opsFor(type: PropertyType | "title"): FilterOp[] {
  switch (type) {
    case "title":
    case "text":
    case "url":
      return ["contains", "notContains", "isEmpty", "isNotEmpty"];
    case "number":
      return ["eq", "gt", "lt", "isEmpty", "isNotEmpty"];
    case "select":
      return ["is", "isNot", "isEmpty", "isNotEmpty"];
    case "status":
      return ["notDone", "done", "is", "isNot"];
    case "multiSelect":
      return ["contains", "notContains", "isEmpty", "isNotEmpty"];
    case "date":
      return ["today", "onOrBeforeToday", "overdue", "thisWeek", "next7", "isEmpty", "isNotEmpty"];
    case "person":
      return ["isMe", "contains", "isEmpty", "isNotEmpty"];
    case "checkbox":
      return ["checked", "unchecked"];
  }
}

const NEEDS_VALUE: FilterOp[] = ["contains", "notContains", "is", "isNot", "eq", "gt", "lt"];

function FilterRow({
  filter,
  schema,
  people,
  onChange,
  onRemove,
}: {
  filter: Filter;
  schema: DbSchema;
  people: People;
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const prop = schema.properties.find((p) => p.id === filter.property);
  const type = filter.property === "title" ? "title" : (prop?.type ?? "text");
  const ops = opsFor(type);
  return (
    <div className="filter-row">
      <select
        aria-label="Veld"
        value={filter.property}
        onChange={(e) => {
          const p = schema.properties.find((x) => x.id === e.target.value);
          onChange({ property: e.target.value, op: opsFor(e.target.value === "title" ? "title" : (p?.type ?? "text"))[0] });
        }}
      >
        <option value="title">Naam</option>
        {schema.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select aria-label="Voorwaarde" value={filter.op} onChange={(e) => onChange({ ...filter, op: e.target.value as FilterOp, value: undefined })}>
        {ops.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
      </select>
      {NEEDS_VALUE.includes(filter.op) &&
        (prop && (prop.type === "select" || prop.type === "status" || prop.type === "multiSelect") ? (
          <select aria-label="Waarde" value={String(filter.value ?? "")} onChange={(e) => onChange({ ...filter, value: e.target.value })}>
            <option value="">Kies…</option>
            {prop.options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : prop?.type === "person" ? (
          <select aria-label="Waarde" value={String(filter.value ?? "")} onChange={(e) => onChange({ ...filter, value: e.target.value })}>
            <option value="">Kies…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <input
            className="pop-input"
            aria-label="Waarde"
            inputMode={prop?.type === "number" ? "decimal" : undefined}
            defaultValue={String(filter.value ?? "")}
            onBlur={(e) => onChange({ ...filter, value: prop?.type === "number" ? Number(e.target.value) : e.target.value })}
          />
        ))}
      <button type="button" className="icon-btn" aria-label="Filter verwijderen" onClick={onRemove}>×</button>
    </div>
  );
}

export function ViewSettings({
  schema,
  view,
  people,
  onSave,
}: {
  schema: DbSchema;
  view: View;
  people: People;
  onSave: (s: DbSchema) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setView = (patch: Partial<View>) => onSave({ ...schema, views: schema.views.map((v) => (v.id === view.id ? { ...v, ...patch } : v)) });
  const groupable = groupableProperties(schema);
  const dates = schema.properties.filter((p) => p.type === "date");
  const visible = view.visible ?? schema.properties.map((p) => p.id);

  return (
    <Popover label="Weergave instellen" trigger="Weergave ⚙" triggerClassName="btn ghost small" width={380} onClose={() => setConfirmDelete(false)}>
      {(close) => (
        <div className="pop-form">
          <div className="row">
            <label style={{ flex: 1 }}>
              Naam
              <input className="pop-input" defaultValue={view.name} onBlur={(e) => e.target.value.trim() && setView({ name: e.target.value.trim() })} />
            </label>
            <label>
              Soort
              <select
                value={view.type}
                onChange={(e) => {
                  const type = e.target.value as View["type"];
                  setView({
                    type,
                    ...(type === "board" && !view.groupBy ? { groupBy: groupable[0]?.id ?? null } : {}),
                    ...(type === "calendar" && !view.dateProperty ? { dateProperty: dates[0]?.id ?? null } : {}),
                  });
                }}
              >
                {VIEW_TYPES.map((t) => <option key={t} value={t}>{VIEW_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
          </div>

          {(view.type === "board" || view.type === "table") && (
            <label>
              {view.type === "board" ? "Kolommen op basis van" : "Groeperen op"}
              <select value={view.groupBy ?? ""} onChange={(e) => setView({ groupBy: e.target.value || null })}>
                {view.type === "table" && <option value="">Niet groeperen</option>}
                {groupable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {view.type === "board" && !groupable.length && <span className="muted pop-note">Voeg eerst een veld van het type Keuze of Status toe.</span>}
            </label>
          )}

          {view.type === "calendar" && (
            <>
              <label>
                Datumveld
                <select value={view.dateProperty ?? ""} onChange={(e) => setView({ dateProperty: e.target.value || null })}>
                  {dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {!dates.length && <span className="muted pop-note">Voeg eerst een veld van het type Datum toe.</span>}
              </label>
              <div className="row">
                <label>
                  Bereik
                  <select value={view.calendarRange ?? "month"} onChange={(e) => setView({ calendarRange: e.target.value as "week" | "month" })}>
                    <option value="week">Week</option>
                    <option value="month">Maand</option>
                  </select>
                </label>
                <label className="row-check">
                  <input type="checkbox" checked={view.showWeekends !== false} onChange={(e) => setView({ showWeekends: e.target.checked })} />
                  Weekend tonen
                </label>
              </div>
            </>
          )}

          <fieldset>
            <legend>Filters</legend>
            {view.filters.map((f, i) => (
              <FilterRow
                key={i}
                filter={f}
                schema={schema}
                people={people}
                onChange={(nf) => setView({ filters: view.filters.map((x, j) => (j === i ? nf : x)) })}
                onRemove={() => setView({ filters: view.filters.filter((_, j) => j !== i) })}
              />
            ))}
            <button type="button" className="btn ghost small" onClick={() => setView({ filters: [...view.filters, { property: "title", op: "contains", value: "" }] })}>
              + Filter
            </button>
          </fieldset>

          <fieldset>
            <legend>Sorteren</legend>
            {view.sorts.map((s, i) => (
              <div key={i} className="filter-row">
                <select aria-label="Sorteren op" value={s.property} onChange={(e) => setView({ sorts: view.sorts.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)) })}>
                  <option value="title">Naam</option>
                  {schema.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select aria-label="Richting" value={s.dir} onChange={(e) => setView({ sorts: view.sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)) })}>
                  <option value="asc">Oplopend</option>
                  <option value="desc">Aflopend</option>
                </select>
                <button type="button" className="icon-btn" aria-label="Sortering verwijderen" onClick={() => setView({ sorts: view.sorts.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="btn ghost small" onClick={() => setView({ sorts: [...view.sorts, { property: "title", dir: "asc" }] })}>
              + Sortering
            </button>
          </fieldset>

          <fieldset>
            <legend>Zichtbare velden</legend>
            {schema.properties.map((p) => (
              <label key={p.id} className="row-check">
                <input
                  type="checkbox"
                  checked={visible.includes(p.id)}
                  onChange={(e) => setView({ visible: e.target.checked ? [...visible, p.id] : visible.filter((id) => id !== p.id) })}
                />
                {p.name}
              </label>
            ))}
          </fieldset>

          {schema.views.length > 1 && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                onSave({ ...schema, views: schema.views.filter((v) => v.id !== view.id) });
                close();
              }}
            >
              {confirmDelete ? "Zeker weten? Klik nog eens" : "Weergave verwijderen"}
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

export function AddViewButton({ schema, onAdd }: { schema: DbSchema; onAdd: (s: DbSchema, viewId: string) => void }) {
  const add = (type: View["type"], close: () => void) => {
    const groupable = groupableProperties(schema);
    const date = schema.properties.find((p) => p.type === "date");
    const view: View = {
      id: newId("v"),
      name: VIEW_TYPE_LABELS[type],
      type,
      filters: [],
      sorts: [],
      ...(type === "board" ? { groupBy: groupable[0]?.id ?? null } : {}),
      ...(type === "calendar" ? { dateProperty: date?.id ?? null, calendarRange: "month" as const, showWeekends: true } : {}),
    };
    onAdd({ ...schema, views: [...schema.views, view] }, view.id);
    close();
  };
  return (
    <Popover label="Weergave toevoegen" trigger="+" triggerClassName="tab add-tab" width={180}>
      {(close) => (
        <ul className="opt-list">
          {VIEW_TYPES.map((t) => (
            <li key={t}>
              <button type="button" onClick={() => add(t, close)}>{VIEW_TYPE_LABELS[t]}</button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
