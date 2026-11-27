import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-build: kleine map met alleen wat nodig is om op Azure App Service te draaien.
  output: "standalone",
  poweredByHeader: false,
  // De Notion-import zet blokken op de server om met BlockNote; die pakketten (en jsdom) laden we als gewone
  // Node-pakketten in plaats van ze te bundelen, anders werken ze niet in servercomponenten en serveracties.
  serverExternalPackages: [
    "@blocknote/server-util",
    "@blocknote/core",
    "@blocknote/react",
    "@blocknote/mantine",
    "@blocknote/xl-multi-column",
    "jsdom",
    // Eén gedeelde Yjs-kopie voor onze code en BlockNote; twee kopieën herkennen elkaars objecten niet.
    "yjs",
    "y-prosemirror",
    "y-protocols",
  ],
  experimental: {
    // Editorwijzigingen gaan als serveractie naar de server; ruim boven de standaard 1 MB.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
