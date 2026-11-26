/**
 * Het editorschema: welke blokken en inline-elementen er bestaan. Bewust géén "use client": de server gebruikt dit
 * schema ook, om geïmporteerde Notion-pagina's om te zetten naar een Yjs-document (src/lib/notion-import.ts).
 * Hoe de eigen blokken eruitzien, regelt de browser via `renderers` (gezet in PageEditor).
 */
import type { ReactNode } from "react";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { withMultiColumn } from "@blocknote/xl-multi-column";

export interface MentionProps {
  kind: "page" | "person";
  targetId: string;
  label: string;
}

export const renderers: {
  mention: (props: MentionProps) => ReactNode;
  database: (props: { databaseId: string; viewId: string }) => ReactNode;
} = {
  mention: ({ label }) => label,
  database: () => null,
};

const Mention = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: {
      kind: { default: "page" as "page" | "person" },
      targetId: { default: "" },
      label: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => <>{renderers.mention(inlineContent.props as MentionProps)}</>,
  },
);

/** Een database midden op een pagina (R12). */
const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      databaseId: { default: "" },
      viewId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block }) => <>{renderers.database({ databaseId: block.props.databaseId, viewId: block.props.viewId })}</>,
  },
)();

export const editorSchema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: { ...defaultBlockSpecs, database: DatabaseBlock },
    inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
  }),
);
