"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDatabaseRow,
  deleteDatabaseRow,
  getDatabaseData,
  moveDatabaseRow,
  saveDatabaseSchema,
  updateDatabaseRow,
} from "@/app/actions";
import { cleanValue, newId, type Color, type DbSchema, type Option, type Props, type Row } from "@/lib/db-model";
import type { DatabaseData } from "@/lib/databases";

const OPTION_COLORS: Color[] = ["blue", "green", "orange", "pink", "purple", "yellow", "red", "brown", "gray"];
const REFRESH_MS = 15_000;

/**
 * Laadt een database en houdt hem bij. Wijzigingen zijn direct zichtbaar (optimistisch) en gaan daarna naar de server;
 * lukt dat niet, dan wordt de database opnieuw geladen en verschijnt een melding.
 */
export function useDatabase(databaseId: string, initial?: DatabaseData) {
  const [data, setData] = useState<DatabaseData | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(0);

  const reload = useCallback(async () => {
    try {
      const fresh = await getDatabaseData(databaseId);
      if (inFlight.current === 0) setData(fresh);
      setError(null);
    } catch {
      setError("Deze database kon niet geladen worden. Misschien heb je er geen toegang (meer) toe.");
    }
  }, [databaseId]);

  useEffect(() => {
    if (!initial) void reload();
    const refresh = () => {
      if (document.visibilityState === "visible" && inFlight.current === 0) void reload();
    };
    const t = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, [reload, initial]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      inFlight.current++;
      try {
        return await fn();
      } catch {
        setError("Opslaan is niet gelukt. Ik heb de database opnieuw geladen; probeer het nog eens.");
        inFlight.current = 0;
        await reload();
        return undefined;
      } finally {
        inFlight.current = Math.max(0, inFlight.current - 1);
      }
    },
    [reload],
  );

  const updateRow = useCallback(
    (rowId: string, patch: { title?: string; props?: Props }) => {
      setData((d) => {
        if (!d) return d;
        const rows = d.rows.map((r) => {
          if (r.id !== rowId) return r;
          const props = { ...r.props };
          for (const [k, v] of Object.entries(patch.props ?? {})) {
            const p = d.schema.properties.find((x) => x.id === k);
            if (p) props[k] = cleanValue(p, v);
          }
          return { ...r, title: patch.title ?? r.title, props };
        });
        return { ...d, rows };
      });
      return run(() => updateDatabaseRow(rowId, patch));
    },
    [run],
  );

  const addRow = useCallback(
    async (input: { title?: string; props?: Props }) => {
      const row = await run(() => addDatabaseRow(databaseId, input));
      if (row) setData((d) => (d ? { ...d, rows: [...d.rows, row as Row] } : d));
      return row as Row | undefined;
    },
    [databaseId, run],
  );

  const removeRow = useCallback(
    (rowId: string) => {
      setData((d) => (d ? { ...d, rows: d.rows.filter((r) => r.id !== rowId) } : d));
      return run(() => deleteDatabaseRow(rowId));
    },
    [run],
  );

  const moveRow = useCallback(
    (rowId: string, beforeRowId: string | null) => {
      setData((d) => {
        if (!d) return d;
        const moving = d.rows.find((r) => r.id === rowId);
        if (!moving) return d;
        const rest = d.rows.filter((r) => r.id !== rowId);
        const idx = beforeRowId ? rest.findIndex((r) => r.id === beforeRowId) : rest.length;
        rest.splice(idx < 0 ? rest.length : idx, 0, moving);
        return { ...d, rows: rest };
      });
      return run(() => moveDatabaseRow(rowId, beforeRowId));
    },
    [run],
  );

  const saveSchema = useCallback(
    (next: DbSchema) => {
      setData((d) => (d ? { ...d, schema: next } : d));
      return run(() => saveDatabaseSchema(databaseId, next));
    },
    [databaseId, run],
  );

  /** Nieuwe keuze toevoegen aan een veld (vanuit een cel). Geeft de nieuwe optie terug. */
  const createOption = useCallback(
    (propertyId: string, name: string): Option | null => {
      if (!data) return null;
      const prop = data.schema.properties.find((p) => p.id === propertyId);
      if (!prop) return null;
      const used = prop.options?.length ?? 0;
      const option: Option = {
        id: newId("o"),
        name: name.trim().slice(0, 100),
        color: OPTION_COLORS[used % OPTION_COLORS.length],
        ...(prop.type === "status" ? { group: "todo" as const } : {}),
      };
      const next: DbSchema = {
        ...data.schema,
        properties: data.schema.properties.map((p) => (p.id === propertyId ? { ...p, options: [...(p.options ?? []), option] } : p)),
      };
      void saveSchema(next);
      return option;
    },
    [data, saveSchema],
  );

  return { data, error, setError, reload, updateRow, addRow, removeRow, moveRow, saveSchema, createOption };
}

export type DatabaseApi = ReturnType<typeof useDatabase>;
