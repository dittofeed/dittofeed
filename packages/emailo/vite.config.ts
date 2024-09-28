import { defineConfig, type Plugin } from "vite";
import { createRPCServer } from "vite-dev-rpc";

import { serverFunctions } from "./scripts/rpc";

function RpcPlugin(): Plugin {
  return {
    name: "rpc",
    configureServer(server) {
      createRPCServer<unknown, typeof serverFunctions>(
        "rpc",
        server.ws,
        serverFunctions,
      );
    },
  };
}

export default defineConfig({
  build: {
    outDir: "snippet",
    lib: {
      entry: "snippetEntry.js", // Entry file for your library
      name: "_df", // Global variable when module is included via a script tag
      fileName: (format) => `dittofeed.${format}.js`,
    },
  },
  optimizeDeps: {
    force: true,
  },
  plugins: [RpcPlugin()],
});
