import { defineConfig, type Plugin, UserConfig } from "vite";
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

const baseBuildConfig = {
  outDir: "dist",
};

let config: UserConfig;

if (process.env.NODE_ENV === "production") {
  config = {
    build: {
      ...baseBuildConfig,
      cssCodeSplit: false,
    },
  };
} else {
  config = {
    plugins: [RpcPlugin()],
    optimizeDeps: {
      force: true,
    },
    build: {
      ...baseBuildConfig,
      lib: {
        entry: "snippetEntry.js", // Entry file for your library
        name: "_df", // Global variable when module is included via a script tag
        fileName: (format) => `dittofeed.${format}.js`,
      },
    },
  };
}

export default defineConfig(config);
