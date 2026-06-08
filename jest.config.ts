import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/packages"],
  moduleNameMapper: {
    "^isomorphic-lib/(.*)$": "<rootDir>/packages/isomorphic-lib/$1",
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "EmailHeadersEditor.test.tsx",
  ],
};

export default config;
