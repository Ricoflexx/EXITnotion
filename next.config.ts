import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-build: kleine map met alleen wat nodig is om op Azure App Service te draaien.
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Editorwijzigingen gaan als serveractie naar de server; ruim boven de standaard 1 MB.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
