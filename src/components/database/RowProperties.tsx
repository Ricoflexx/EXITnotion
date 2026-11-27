"use client";

import { useState } from "react";
import { saveDatabaseSchema, updateDatabaseRow } from "@/app/actions";
import { cleanValue, newId, type Color, type DbSchema, type Option, type Props } from "@/lib/db-model";
import { Cell, type People } from "./cells";

const COLORS: Color[] = ["blue", "green", "orange", "pink", "purple", "yellow", "red", "brown", "gray"];

/** Eigenschappen bovenaan een rijpagina, zoals in Notion. */
export function RowProperties({
  rowId,
  databaseId,
  schema: initialSchema,
  props: initialProps,
  people,
  editable,
}: {
  rowId: string;
  databaseId: string;
  schema: DbSchema;
  props: Props;
  people: People;
  editable: boolean;
}) {
  const [schema, setSchema] = useState(initialSchema);
  const [props, setProps] = useState(initialProps);
  const [error, setError] = useState<string | null>(null);

  const change = (propertyId: string, value: Props[string]) => {
    const p = schema.properties.find((x) => x.id === propertyId);
    if (!p) return;
    setProps((cur) => ({ ...cur, [propertyId]: cleanValue(p, value) }));
    updateDatabaseRow(rowId, { props: { [propertyId]: value } }).catch(() => setError("Opslaan is niet gelukt. Herlaad de pagina en probeer het opnieuw."));
  };

  const createOption = (propertyId: string, name: string): Option | null => {
    const p = schema.properties.find((x) => x.id === propertyId);
    if (!p) return null;
    const option: Option = {
      id: newId("o"),
      name: name.trim(),
      color: COLORS[(p.options?.length ?? 0) % COLORS.length],
      ...(p.type === "status" ? { group: "todo" as const } : {}),
    };
    const next = { ...schema, properties: schema.properties.map((x) => (x.id === propertyId ? { ...x, options: [...(x.options ?? []), option] } : x)) };
    setSchema(next);
    saveDatabaseSchema(databaseId, next).catch(() => setError("De nieuwe keuze is niet opgeslagen."));
    return option;
  };

  if (!schema.properties.length) return null;
  return (
    <dl className="row-props">
      {schema.properties.map((p) => (
        <div key={p.id} className="row-prop">
          <dt>{p.name}</dt>
          <dd>
            <Cell
              property={p}
              value={props[p.id] ?? null}
              people={people}
              editable={editable}
              onChange={(v) => change(p.id, v)}
              onCreateOption={(name) => createOption(p.id, name)}
            />
          </dd>
        </div>
      ))}
      {error && <p className="db-error" role="alert">{error}</p>}
    </dl>
  );
}
