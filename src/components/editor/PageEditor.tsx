"use client";

import "@blocknote/mantine/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { BlockNoteSchema, combineByGroup, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { withCollaboration } from "@blocknote/core/yjs";
import * as coreLocales from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
  multiColumnDropCursor,
  withMultiColumn,
} from "@blocknote/xl-multi-column";
import { findMentionTargets, newInlineDatabase, pullDocUpdates, pushDocUpdate, templateDone } from "@/app/actions";
import { FRAGMENT } from "@/lib/yjs-text";
import { DB_TEMPLATE_LABELS, type DbTemplate } from "@/lib/db-templates";
import { DatabaseBlock, editorUser } from "./DatabaseBlock";
import { logbookDay, templateBlocks, type TemplateName } from "./templates";

// --- Verwijzingen met @ (R28) -------------------------------------------------------------

function MentionChip({ kind, targetId, label }: { kind: string; targetId: string; label: string }) {
  const router = useRouter();
  if (kind === "page") {
    return (
      <a
        href={`/p/${targetId}`}
        className="mention mention-page"
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          router.push(`/p/${targetId}`);
        }}
      >
        {label}
      </a>
    );
  }
  return (
    <span className="mention mention-person" contentEditable={false}>
      @{label}
    </span>
  );
}

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
    render: ({ inlineContent }) => <MentionChip {...inlineContent.props} />,
  },
);

const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: { ...defaultBlockSpecs, database: DatabaseBlock },
    inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
  }),
);

const dictionary = { ...coreLocales.nl, multi_column: multiColumnLocales.nl };

// --- Hulpfuncties -------------------------------------------------------------------------

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const COLORS = ["#4f7414", "#f68d2e", "#2f7fb5", "#8a4fb5", "#b5422f", "#2f9e8f"];
const colorFor = (name: string) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const SAVE_DELAY_MS = 700;
const POLL_MS = 4000;
const REMOTE = "server";

type SaveState = "opgeslagen" | "bezig" | "fout";

export interface PageEditorProps {
  pageId: string;
  initialState: string | null;
  editable: boolean;
  userName: string;
  userId: string;
  /** Sjabloonpagina die nog gevuld moet worden (alleen voor wie mag bewerken). */
  template: { name: TemplateName; refs: Record<string, string> } | null;
}

export default function PageEditor({ pageId, initialState, editable, userName, userId, template }: PageEditorProps) {
  editorUser.id = userId;
  const doc = useMemo(() => {
    const d = new Y.Doc();
    if (initialState) Y.applyUpdate(d, fromB64(initialState), REMOTE);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);
  const awareness = useMemo(() => new Awareness(doc), [doc]);
  useEffect(() => () => { awareness.destroy(); doc.destroy(); }, [doc, awareness]);

  const uploadFile = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      form.set("pageId", pageId);
      const res = await fetch("/api/files", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertOnce(body.error ?? "Uploaden is niet gelukt.");
        throw new Error(body.error ?? "Upload mislukt");
      }
      return body.url as string;
    },
    [pageId],
  );

  const editor = useCreateBlockNote(
    withCollaboration({
      schema,
      dictionary,
      dropCursor: multiColumnDropCursor,
      uploadFile: editable ? uploadFile : undefined,
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
      collaboration: {
        fragment: doc.getXmlFragment(FRAGMENT),
        user: { name: userName, color: colorFor(userName) },
        provider: { awareness },
      },
    }),
    [doc],
  );

  // --- Opslaan (R29): wijzigingen bundelen en na een korte pauze versturen ----------------
  const [saveState, setSaveState] = useState<SaveState>("opgeslagen");
  const pending = useRef<Uint8Array[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);
  const lastLocalEdit = useRef(0);

  const flush = useCallback(async () => {
    if (flushing.current || !pending.current.length) return;
    flushing.current = true;
    const batch = pending.current;
    pending.current = [];
    setSaveState("bezig");
    try {
      await pushDocUpdate(pageId, toB64(Y.mergeUpdates(batch)));
      setSaveState(pending.current.length ? "bezig" : "opgeslagen");
    } catch {
      pending.current = [...batch, ...pending.current];
      setSaveState("fout");
      timer.current = setTimeout(() => void flush(), 5000);
    } finally {
      flushing.current = false;
      if (pending.current.length && !timer.current) timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    }
  }, [pageId]);

  useEffect(() => {
    if (!editable) return;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      pending.current.push(update);
      lastLocalEdit.current = Date.now();
      setSaveState("bezig");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, SAVE_DELAY_MS);
    };
    doc.on("update", onUpdate);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      doc.off("update", onUpdate);
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [doc, editable, flush]);

  // --- Wijzigingen van anderen ophalen, en laten zien wie er nog meer is --------------------
  const [others, setOthers] = useState<{ name: string; editing: boolean }[]>([]);
  useEffect(() => {
    let stopped = false;
    const pull = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await pullDocUpdates(pageId, toB64(Y.encodeStateVector(doc)), Date.now() - lastLocalEdit.current < 30_000);
        if (stopped) return;
        if (res.update) Y.applyUpdate(doc, fromB64(res.update), REMOTE);
        setOthers(res.others);
      } catch {
        /* volgende keer opnieuw */
      }
    };
    const id = setInterval(pull, POLL_MS);
    document.addEventListener("visibilitychange", pull);
    void pull();
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [doc, pageId]);

  // --- Sjabloonpagina vullen (welkom, werkplek, notulen, …) --------------------------------
  const templateName = template?.name;
  useEffect(() => {
    if (!template || !editable) return;
    const t = setTimeout(() => {
      const first = editor.document[0];
      const isEmpty = editor.document.length <= 1 && (!first || (Array.isArray(first.content) && first.content.length === 0));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (isEmpty) editor.replaceBlocks(editor.document, templateBlocks(template.name, template.refs) as any);
      void templateDone(pageId);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName, editable, editor, pageId]);

  // --- Menu's -------------------------------------------------------------------------------
  const slashItems = useCallback(
    async (query: string) => {
      const insertAfterCursor = (blocks: unknown[]) => {
        const at = editor.getTextCursorPosition().block;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.insertBlocks(blocks as any, at, "after");
      };
      const dbItem = (template: DbTemplate, aliases: string[]): DefaultReactSuggestionItem => ({
        title: template === "leeg" ? "Database" : `Database: ${DB_TEMPLATE_LABELS[template]}`,
        subtext: template === "leeg" ? "Lege tabel met eigen velden" : "Tabel, bord of kalender, midden op de pagina",
        group: "Databases",
        aliases: ["database", "tabel", "kalender", "bord", ...aliases],
        onItemClick: async () => {
          try {
            const databaseId = await newInlineDatabase(pageId, template);
            insertAfterCursor([{ type: "database", props: { databaseId } }]);
          } catch {
            alertOnce("De database kon niet gemaakt worden. Heb je bewerkrechten op deze pagina?");
          }
        },
      });
      const exitItems: DefaultReactSuggestionItem[] = [
        dbItem("taken", ["taken", "planning", "agenda"]),
        dbItem("todo", ["todo", "to do", "taken"]),
        dbItem("contentkalender", ["content", "social", "posts"]),
        dbItem("notities", ["notities"]),
        dbItem("leeg", ["leeg"]),
        {
          title: "Logboekdag",
          subtext: "Kopje met de datum van vandaag en een lijstje",
          group: "EXIT",
          aliases: ["logboek", "dag", "vandaag", "datum"],
          onItemClick: () => insertAfterCursor(logbookDay()),
        },
        {
          title: "Datum van vandaag",
          group: "EXIT",
          aliases: ["datum", "vandaag", "today"],
          onItemClick: () =>
            editor.insertInlineContent(new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) + " "),
        },
      ];
      return filterSuggestionItems(
        combineByGroup(getDefaultReactSlashMenuItems(editor), getMultiColumnSlashMenuItems(editor), exitItems),
        query,
      );
    },
    [editor, pageId],
  );

  const mentionItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const { pages, people } = await findMentionTargets(query);
      const insert = (kind: "page" | "person", targetId: string, label: string) => () =>
        editor.insertInlineContent([{ type: "mention", props: { kind, targetId, label } }, " "]);
      return [
        ...pages.map((p) => ({
          title: p.title,
          subtext: p.spaceName,
          group: "Pagina's",
          onItemClick: insert("page", p.id, p.title),
        })),
        ...people.map((p) => ({
          title: p.name,
          group: "Collega's",
          onItemClick: insert("person", p.id, p.name),
        })),
      ];
    },
    [editor],
  );

  const someoneEditing = others.filter((o) => o.editing);

  return (
    <div className="editor-wrap">
      <div className="editor-status" aria-live="polite">
        {someoneEditing.length > 0 && (
          <span className="presence">
            {someoneEditing.map((o) => o.name).join(", ")} {someoneEditing.length === 1 ? "is" : "zijn"} deze pagina ook aan het bewerken
          </span>
        )}
        {editable && (
          <span className={"save " + saveState}>
            {saveState === "opgeslagen" && "Opgeslagen"}
            {saveState === "bezig" && "Opslaan…"}
            {saveState === "fout" && "Niet opgeslagen. Ik probeer het opnieuw…"}
          </span>
        )}
      </div>
      <BlockNoteView editor={editor} editable={editable} slashMenu={false} className="editor">
        <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
        <SuggestionMenuController triggerCharacter="@" getItems={mentionItems} />
      </BlockNoteView>
    </div>
  );
}

let lastAlert = 0;
function alertOnce(message: string) {
  // Eenvoudige melding zonder extra bibliotheek; max. één per 3 seconden.
  if (Date.now() - lastAlert < 3000) return;
  lastAlert = Date.now();
  window.alert(message);
}
