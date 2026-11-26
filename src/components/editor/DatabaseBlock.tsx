"use client";

import { DatabaseView } from "@/components/database/DatabaseView";

/** Id van de ingelogde gebruiker, voor filters als "ben ik". Gezet door PageEditor. */
export const editorUser = { id: "" };

export function DatabaseBlockView({ databaseId, viewId }: { databaseId: string; viewId: string }) {
  return databaseId ? (
    <div className="db-block">
      <DatabaseView databaseId={databaseId} inline initialViewId={viewId || undefined} me={editorUser.id} />
    </div>
  ) : (
    <div className="db-block muted">Database ontbreekt.</div>
  );
}
