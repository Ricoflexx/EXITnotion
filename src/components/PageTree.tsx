"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { newPage } from "@/app/actions";

export interface TreeItem {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
}

const STORAGE_KEY = "exitnotion:open";

function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/** Paginaboom in de zijbalk, met open- en dichtklappen dat onthouden wordt in deze browser. */
export function PageTree({ items, canAdd }: { items: TreeItem[]; canAdd: boolean }) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/p/") ? pathname.slice(3) : null;
  const [open, setOpen] = useState<Set<string>>(new Set());

  const children = useMemo(() => {
    const map = new Map<string | null, TreeItem[]>();
    const ids = new Set(items.map((i) => i.id));
    for (const item of items) {
      // Pagina's waarvan de ouder niet zichtbaar is, tonen we in de wortel.
      const key = item.parentId && ids.has(item.parentId) ? item.parentId : null;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  useEffect(() => {
    const stored = readOpen();
    // Klap de ouders van de actieve pagina open.
    if (activeId) {
      const byId = new Map(items.map((i) => [i.id, i]));
      let cur = byId.get(activeId);
      while (cur?.parentId) {
        stored.add(cur.parentId);
        cur = byId.get(cur.parentId);
      }
    }
    setOpen(stored);
  }, [activeId, items]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* opslag niet beschikbaar */
      }
      return next;
    });
  }

  function render(parent: string | null) {
    const list = children.get(parent) ?? [];
    if (!list.length) return null;
    return (
      <ul className="tree">
        {list.map((item) => {
          const kids = children.get(item.id)?.length ?? 0;
          const isOpen = open.has(item.id);
          return (
            <li key={item.id}>
              <div className="tree-row">
                <button
                  type="button"
                  className={"twisty" + (kids ? "" : " empty")}
                  aria-label={isOpen ? "Dichtklappen" : "Openklappen"}
                  aria-expanded={isOpen}
                  onClick={() => toggle(item.id)}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
                <Link href={`/p/${item.id}`} className="side-link" aria-current={item.id === activeId ? "page" : undefined}>
                  {item.icon ? `${item.icon} ` : ""}
                  {item.title || "Naamloos"}
                </Link>
                {canAdd && (
                  <form action={newPage}>
                    <input type="hidden" name="parentId" value={item.id} />
                    <button className="add-btn" type="submit" aria-label={`Subpagina in ${item.title || "Naamloos"}`} title="Subpagina toevoegen">
                      +
                    </button>
                  </form>
                )}
              </div>
              {isOpen && render(item.id)}
            </li>
          );
        })}
      </ul>
    );
  }

  return render(null) ?? <p className="muted" style={{ margin: "2px 8px", fontSize: 14 }}>Nog geen pagina&apos;s</p>;
}
