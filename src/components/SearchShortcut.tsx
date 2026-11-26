"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Ctrl+K (of Cmd+K op een Mac) opent zoeken. */
export function SearchShortcut() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/zoeken");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
