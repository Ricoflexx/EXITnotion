import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-build: kleine map met alleen wat nodig is om op Azure App Service te draaien.
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
