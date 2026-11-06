import { defineConfig } from "tsup";

// Empacota a API num único bundle ESM; @ss/shared (TS puro) entra no bundle.
export default defineConfig({
  entry: { server: "src/server.ts", worker: "src/worker.ts", seed: "prisma/seed.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: ["@ss/shared"],
});
