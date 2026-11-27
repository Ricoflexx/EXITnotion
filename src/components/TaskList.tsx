"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { taskComplete, taskQuickAdd, taskReschedule } from "@/app/actions";
import { addDays, dayKey } from "@/lib/db-model";
import type { Task } from "@/lib/databases";
import { formatDay } from "./database/cells";

const TABS = [
  { id: "vandaag", label: "Vandaag" },
  { id: "morgen", label: "Morgen" },
  { id: "week", label: "Volgende 7 dagen" },
  { id: "alles", label: "Alles" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface Section {
  key: string;
  label: string;
  tasks: Task[];
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const today = dayKey(new Date());
  const tomorrow = addDays(today, 1);
  const [tab, setTab] = useState<Tab>("vandaag");
  const [title, setTitle] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = tasks.filter((t) => !done.has(t.id));
  const sections: Section[] = useMemo(() => {
    const overdue = open.filter((t) => t.day && t.day < today);
    const on = (d: string) => open.filter((t) => t.day === d);
    const next7 = open.filter((t) => t.day && t.day > tomorrow && t.day <= addDays(today, 7));
    const later = open.filter((t) => t.day && t.day > addDays(today, 7));
    const none = open.filter((t) => !t.day);
    switch (tab) {
      case "vandaag":
        return [
          { key: "te-laat", label: "Te laat", tasks: overdue },
          { key: "vandaag", label: "Vandaag", tasks: on(today) },
        ];
      case "morgen":
        return [{ key: "morgen", label: "Morgen", tasks: on(tomorrow) }];
      case "week":
        return [
          { key: "morgen", label: "Morgen", tasks: on(tomorrow) },
          { key: "week", label: "Later deze week", tasks: next7 },
        ];
      default:
        return [
          { key: "te-laat", label: "Te laat", tasks: overdue },
          { key: "vandaag", label: "Vandaag", tasks: on(today) },
          { key: "morgen", label: "Morgen", tasks: on(tomorrow) },
          { key: "week", label: "Volgende 7 dagen", tasks: next7 },
          { key: "later", label: "Later", tasks: later },
          { key: "geen", label: "Zonder datum", tasks: none },
        ];
    }
  }, [open, tab, today, tomorrow]);

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        setError(null);
        router.refresh();
      } catch {
        setError("Dat is niet gelukt. Probeer het opnieuw.");
      }
    });

  const addDay = tab === "morgen" ? tomorrow : tab === "alles" ? null : today;
  const counts: Record<Tab, number> = {
    vandaag: open.filter((t) => t.day && t.day <= today).length,
    morgen: open.filter((t) => t.day === tomorrow).length,
    week: open.filter((t) => t.day && t.day > today && t.day <= addDays(today, 7)).length,
    alles: open.length,
  };

  return (
    <div className="tasks">
      <div className="tabs" role="tablist" aria-label="Lijsten">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
            {t.label} <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          const value = title.trim();
          if (!value) return;
          setTitle("");
          act(() => taskQuickAdd(value, addDay));
        }}
      >
        <input
          id="quick-add"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={addDay === today ? "Taak voor vandaag toevoegen…" : addDay ? "Taak voor morgen toevoegen…" : "Taak zonder datum toevoegen…"}
          aria-label="Nieuwe taak"
        />
        <button className="btn primary" type="submit" disabled={pending}>Toevoegen</button>
      </form>
      {error && <p className="db-error" role="alert">{error}</p>}

      {sections.map((s) =>
        s.tasks.length ? (
          <section key={s.key} className="task-section" aria-label={s.label}>
            <h2 className={s.key === "te-laat" ? "overdue" : ""}>
              {s.label} <span className="muted">{s.tasks.length}</span>
            </h2>
            <ul className="task-list">
              {s.tasks.map((t) => (
                <li key={t.id} className="task">
                  <input
                    type="checkbox"
                    aria-label={`${t.title || "Naamloos"} afvinken`}
                    onChange={() => {
                      setDone((d) => new Set(d).add(t.id));
                      act(() => taskComplete(t.id));
                    }}
                  />
                  <div className="task-main">
                    <Link href={`/p/${t.id}`} className="task-title">{t.title || "Naamloos"}</Link>
                    <span className="task-meta">
                      {t.day && t.day !== today && <span className={t.day < today ? "overdue" : ""}>{formatDay(t.day)}</span>}
                      {t.time && <span>{t.time}</span>}
                      {t.listName && <span className={`chip c-${t.listColor}`}>{t.listName}</span>}
                      {t.statusName && t.statusName !== "Te doen" && t.statusName !== "Niet gestart" && (
                        <span className={`chip c-${t.statusColor}`}>{t.statusName}</span>
                      )}
                      {!t.own && <span className="muted">uit {t.databaseTitle || "een database"}</span>}
                    </span>
                  </div>
                  {t.day !== tomorrow && (
                    <button type="button" className="btn ghost small" onClick={() => act(() => taskReschedule(t.id, tomorrow))} title="Doorschuiven naar morgen">
                      → Morgen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {sections.every((s) => !s.tasks.length) && (
        <p className="muted empty-tasks">{tab === "vandaag" ? "Niets meer voor vandaag. Goed bezig!" : "Hier staat niets."}</p>
      )}
    </div>
  );
}
