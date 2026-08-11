import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      // `server-only` exists to throw when imported from a client bundle.
      // Vitest resolves its client build, so it would throw for every server
      // module under test. The guarantee is enforced by `next build`, which
      // fails if a "use client" module imports a server-only one.
      "server-only": path.resolve(root, "./test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
