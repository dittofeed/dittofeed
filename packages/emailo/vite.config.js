import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "snippet",
    lib: {
      entry: "snippetEntry.js", // Entry file for your library
      name: "_df", // Global variable when module is included via a script tag
      fileName: (format) => `dittofeed.${format}.js`,
    },
  },
});
