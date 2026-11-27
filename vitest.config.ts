import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";

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
      UPLOAD_DIR: path.join(os.tmpdir(), "homebase-test-uploads"),
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://homebase:homebase@localhost:5432/homebase_test",
    },
    globalSetup: ["tests/global-setup.ts"],
    // Integratietests delen één database; niet parallel draaien.
    fileParallelism: false,
  },
});
