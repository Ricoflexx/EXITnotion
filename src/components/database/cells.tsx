"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLOR_LABELS,
  type DateValue,
  type Option,
  type PropValue,
  type Property,
} from "@/lib/db-model";
import { Popover } from "./Popover";

export type People = { id: string; name: string }[];

// ---------------------------------------------------------------------------------------------
// Weergave
// ---------------------------------------------------------------------------------------------

export function Chip({ option }: { option: Pick<Option, "name" | "color"> }) {
  return (
    <span className={`chip c-${option.color}`} title={COLOR_LABELS[option.color]}>
      {option.name || "Naamloos"}
    </span>
  );
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function formatDay(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  const time = value.length === 16 ? ` ${value.slice(11)}` : "";
  return `${d} ${MONTHS[m - 1]}${sameYear ? "" : ` ${y}`}${time}`;
}

export function formatDate(v: DateValue | null): string {
  if (!v) return "";
  return v.end ? `${formatDay(v.start)} → ${formatDay(v.end)}` : formatDay(v.start);
}

/** Alleen tonen (bord, kalender, of zonder bewerkrechten). */
export function ValueDisplay({ property, value, people }: { property: Property; value: PropValue; people: People }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) {
    return property.type === "checkbox" ? <input type="checkbox" checked={false} disabled aria-label={property.name} /> : null;
  }
  switch (property.type) {
    case "select":
    case "status": {
      const o = property.options?.find((x) => x.id === value);
      return o ? <Chip option={o} /> : null;
    }
    case "multiSelect":
      return (
        <span className="chips">
          {(value as string[]).map((id) => {
            const o = property.options?.find((x) => x.id === id);
            return o ? <Chip key={id} option={o} /> : null;
          })}
        </span>
      );
    case "person":
      return (
        <span className="chips">
          {(value as string[]).map((id) => (
            <span key={id} className="person">{people.find((p) => p.id === id)?.name ?? "Onbekend"}</span>
          ))}
        </span>
      );
    case "date":
      return <span className="date-value">{formatDate(value as DateValue)}</span>;
    case "checkbox":
      return <input type="checkbox" checked={value === true} disabled aria-label={property.name} />;
    case "url": {
      const href = String(value);
      const safe = /^https?:\/\//i.test(href) ? href : `https://${href}`;
      return (
        <a href={safe} target="_blank" rel="noopener noreferrer" className="url-value" onClick={(e) => e.stopPropagation()}>
          {href.replace(/^https?:\/\//i, "")}
        </a>
      );
    }
    case "number":
      return <span className="num">{(value as number).toLocaleString("nl-NL")}</span>;
    default:
      return <span className="text-value">{String(value)}</span>;
  }
}

// ---------------------------------------------------------------------------------------------
// Bewerken
// ---------------------------------------------------------------------------------------------

export interface CellProps {
  property: Property;
  value: PropValue;
  people: People;
  editable: boolean;
  onChange: (value: PropValue) => void;
  /** Nieuwe keuze aanmaken bij keuze-, meerkeuze- en statusvelden. */
  onCreateOption?: (name: string) => Option | null;
}

export function Cell(props: CellProps) {
  const { property, value, people, editable } = props;
  if (!editable) return <ValueDisplay property={property} value={value} people={people} />;
  switch (property.type) {
    case "text":
    case "url":
    case "number":
      return <InlineInput {...props} />;
    case "checkbox":
      return (
        <input
          type="checkbox"
          className="cell-checkbox"
          checked={value === true}
          aria-label={property.name}
          onChange={(e) => props.onChange(e.target.checked)}
        />
      );
    case "select":
    case "status":
    case "multiSelect":
      return <OptionsCell {...props} />;
    case "person":
      return <PersonCell {...props} />;
    case "date":
      return <DateCell {...props} />;
  }
}

function InlineInput({ property, value, onChange, people }: CellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (property.type === "number") {
      const n = draft.trim() === "" ? null : Number(draft.replace(",", "."));
      if (n === null || Number.isFinite(n)) onChange(n);
    } else onChange(draft);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="cell-button"
        aria-label={`${property.name} bewerken`}
        onClick={() => {
          setDraft(value === null || value === undefined ? "" : String(value));
          setEditing(true);
        }}
      >
        <ValueDisplay property={property} value={value} people={people} />
        {(value === null || value === "") && <span className="cell-empty">Leeg</span>}
      </button>
    );
  }
  return (
    <input
      ref={input}
      className="cell-input"
      type={property.type === "number" ? "text" : property.type === "url" ? "url" : "text"}
      inputMode={property.type === "number" ? "decimal" : undefined}
      value={draft}
      aria-label={property.name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function OptionsCell({ property, value, onChange, onCreateOption, people }: CellProps) {
  const multi = property.type === "multiSelect";
  const selected = multi ? ((value as string[] | null) ?? []) : value ? [value as string] : [];
  const [query, setQuery] = useState("");
  const options = property.options ?? [];
  const filtered = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase());

  const toggle = (id: string, close: () => void) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    else {
      onChange(selected[0] === id ? null : id);
      close();
    }
  };

  return (
    <Popover
      label={`${property.name} kiezen`}
      triggerClassName="cell-button"
      trigger={
        <>
          <ValueDisplay property={property} value={value} people={people} />
          {!selected.length && <span className="cell-empty">Leeg</span>}
        </>
      }
      onClose={() => setQuery("")}
    >
      {(close) => (
        <div className="opt-panel">
          {onCreateOption && (
            <input
              className="pop-input"
              placeholder="Zoek of maak een keuze…"
              value={query}
              autoFocus
              aria-label="Zoek of maak een keuze"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (filtered[0] && (exact || !query.trim())) toggle(filtered[0].id, close);
                else if (query.trim() && onCreateOption) {
                  const o = onCreateOption(query);
                  if (o) toggle(o.id, close);
                  setQuery("");
                }
              }}
            />
          )}
          <ul className="opt-list" role="listbox" aria-multiselectable={multi}>
            {filtered.map((o) => (
              <li key={o.id}>
                <button type="button" role="option" aria-selected={selected.includes(o.id)} onClick={() => toggle(o.id, close)}>
                  <span className="check">{selected.includes(o.id) ? "✓" : ""}</span>
                  <Chip option={o} />
                </button>
              </li>
            ))}
          </ul>
          {query.trim() && !exact && onCreateOption && (
            <button
              type="button"
              className="opt-create"
              onClick={() => {
                const o = onCreateOption(query);
                if (o) toggle(o.id, close);
                setQuery("");
              }}
            >
              + Maak &quot;{query.trim()}&quot;
            </button>
          )}
          {!options.length && !onCreateOption && <p className="muted pop-note">Nog geen keuzes.</p>}
        </div>
      )}
    </Popover>
  );
}

function PersonCell({ property, value, onChange, people }: CellProps) {
  const selected = (value as string[] | null) ?? [];
  return (
    <Popover
      label={`${property.name} kiezen`}
      triggerClassName="cell-button"
      trigger={
        <>
          <ValueDisplay property={property} value={value} people={people} />
          {!selected.length && <span className="cell-empty">Leeg</span>}
        </>
      }
    >
      <ul className="opt-list" role="listbox" aria-multiselectable>
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected.includes(p.id)}
              onClick={() => onChange(selected.includes(p.id) ? selected.filter((s) => s !== p.id) : [...selected, p.id])}
            >
              <span className="check">{selected.includes(p.id) ? "✓" : ""}</span>
              <span className="person">{p.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

function DateCell({ property, value, onChange, people }: CellProps) {
  const v = value as DateValue | null;
  const [withTime, setWithTime] = useState(v?.start.length === 16);
  const [withEnd, setWithEnd] = useState(Boolean(v?.end));
  const dayPart = (s?: string | null) => (s ? s.slice(0, 10) : "");
  const timePart = (s?: string | null) => (s && s.length === 16 ? s.slice(11) : "09:00");

  const set = (start: string, end: string | null, time: boolean) => {
    if (!start) return onChange(null);
    const fmt = (d: string, t: string) => (time ? `${d}T${t}` : d);
    onChange({
      start: fmt(start, timePart(v?.start)),
      ...(end ? { end: fmt(end, timePart(v?.end)) } : {}),
    });
  };

  return (
    <Popover
      label={`${property.name} kiezen`}
      triggerClassName="cell-button"
      width={260}
      trigger={
        <>
          <ValueDisplay property={property} value={value} people={people} />
          {!v && <span className="cell-empty">Leeg</span>}
        </>
      }
    >
      <div className="date-panel">
        <label>
          Datum
          <input
            type="date"
            value={dayPart(v?.start)}
            onChange={(e) => set(e.target.value, withEnd ? dayPart(v?.end) || e.target.value : null, withTime)}
          />
        </label>
        {withTime && (
          <label>
            Tijd
            <input
              type="time"
              value={timePart(v?.start)}
              onChange={(e) => v && onChange({ ...v, start: `${dayPart(v.start)}T${e.target.value}` })}
            />
          </label>
        )}
        {withEnd && (
          <label>
            Tot en met
            <input
              type="date"
              value={dayPart(v?.end)}
              min={dayPart(v?.start)}
              onChange={(e) => v && set(dayPart(v.start), e.target.value, withTime)}
            />
          </label>
        )}
        <label className="row-check">
          <input
            type="checkbox"
            checked={withTime}
            onChange={(e) => {
              setWithTime(e.target.checked);
              if (v) set(dayPart(v.start), withEnd ? dayPart(v.end) : null, e.target.checked);
            }}
          />
          Met tijd
        </label>
        <label className="row-check">
          <input
            type="checkbox"
            checked={withEnd}
            onChange={(e) => {
              setWithEnd(e.target.checked);
              if (v) set(dayPart(v.start), e.target.checked ? dayPart(v.start) : null, withTime);
            }}
          />
          Einddatum
        </label>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => set(new Date().toLocaleDateString("sv-SE"), null, withTime)}>
            Vandaag
          </button>
          {v && (
            <button type="button" className="btn ghost" onClick={() => onChange(null)}>
              Wissen
            </button>
          )}
        </div>
      </div>
    </Popover>
  );
}
