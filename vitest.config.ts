import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://exitnotion:exitnotion@localhost:5432/exitnotion_test",
    },
    globalSetup: ["tests/global-setup.ts"],
    // Integratietests delen één database; niet parallel draaien.
    fileParallelism: false,
  },
});
