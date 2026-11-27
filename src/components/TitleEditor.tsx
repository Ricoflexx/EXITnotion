"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveTitle } from "@/app/actions";

/** Paginatitel die automatisch wordt opgeslagen (R29). */
export function TitleEditor({ pageId, initial, editable }: { pageId: string; initial: string; editable: boolean }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"" | "bezig" | "opgeslagen" | "fout">("");
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(initial);

  useEffect(() => {
    setValue(initial);
    saved.current = initial;
  }, [pageId, initial]);

  function save(next: string) {
    if (next === saved.current) return;
    setStatus("bezig");
    startTransition(async () => {
      try {
        await saveTitle(pageId, next);
        saved.current = next;
        setStatus("opgeslagen");
      } catch {
        setStatus("fout");
      }
    });
  }

  if (!editable) return <h1 className="title-input">{initial || "Naamloos"}</h1>;

  return (
    <div>
      <input
        id="page-title"
        className="title-input"
        value={value}
        placeholder="Naamloos"
        aria-label="Paginatitel"
        autoFocus={!initial}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(next), 600);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          save(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {/* De editor toont al "Opgeslagen"; hier alleen een melding als de titel niet is opgeslagen. */}
      <div className="title-status" aria-live="polite">
        {status === "fout" && "De titel is niet opgeslagen. Controleer je verbinding en probeer het opnieuw."}
      </div>
    </div>
  );
}
