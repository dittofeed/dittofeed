import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    alias: {
      "isomorphic-lib": path.resolve(__dirname, "packages/isomorphic-lib"),
    },
  },
});
