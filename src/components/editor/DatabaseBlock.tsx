"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { DatabaseView } from "@/components/database/DatabaseView";

/** Id van de ingelogde gebruiker, voor filters als "ben ik". Gezet door PageEditor. */
export const editorUser = { id: "" };

/** Een database midden op een pagina (R12), zoals de kalender op Liv's startpagina. */
export const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      databaseId: { default: "" },
      viewId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block }) =>
      block.props.databaseId ? (
        <div className="db-block">
          <DatabaseView databaseId={block.props.databaseId} inline initialViewId={block.props.viewId || undefined} me={editorUser.id} />
        </div>
      ) : (
        <div className="db-block muted">Database ontbreekt.</div>
      ),
  },
)();
