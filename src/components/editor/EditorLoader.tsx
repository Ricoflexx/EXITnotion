"use client";

import dynamic from "next/dynamic";
import type { PageEditorProps } from "./PageEditor";

/** Laadt de editor pas in de browser, zodat de pagina zelf snel verschijnt (R86). */
const PageEditor = dynamic(() => import("./PageEditor"), {
  ssr: false,
  loading: () => <div className="editor-loading" aria-busy="true">Editor laden…</div>,
});

export function EditorLoader(props: PageEditorProps) {
  return <PageEditor {...props} />;
}
