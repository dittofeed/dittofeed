const { defaults: tsjPreset } = require("ts-jest/presets");

const BASE_CONFIG = {
  clearMocks: true,
  transform: {
    ...tsjPreset.transform,
  },
  setupFilesAfterEnv: ["jest-expect-message"],
};

const config = {
  testEnvironment: "node",
  projects: [
    {
      ...BASE_CONFIG,
      globalTeardown: "<rootDir>/packages/backend-lib/test/globalTeardown.ts",
      globalSetup: "<rootDir>/packages/backend-lib/test/globalSetup.ts",
      setupFilesAfterEnv: [
        "<rootDir>/packages/backend-lib/test/setup.ts",
        "jest-expect-message",
      ],
      displayName: "backend-lib",
      roots: ["<rootDir>/packages/backend-lib/src"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "<rootDir>/packages/backend-lib/tsconfig.json",
          },
        ],
      },
    },
    {
      ...BASE_CONFIG,
      displayName: "dashboard",
      roots: ["<rootDir>/packages/dashboard/src"],
      globalTeardown: "<rootDir>/packages/backend-lib/test/globalTeardown.ts",
      globalSetup: "<rootDir>/packages/backend-lib/test/globalSetup.ts",
      setupFilesAfterEnv: [
        "<rootDir>/packages/backend-lib/test/setup.ts",
        "jest-expect-message",
      ],
      moduleNameMapper: {
        "\\.css$": "<rootDir>/packages/dashboard/test/__mocks__/styleMock.ts",
      },
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "<rootDir>/packages/dashboard/tsconfig.json",
          },
        ],
      },
    },
    {
      ...BASE_CONFIG,
      displayName: "api",
      roots: ["<rootDir>/packages/api/src"],
      globalTeardown: "<rootDir>/packages/backend-lib/test/globalTeardown.ts",
      globalSetup: "<rootDir>/packages/backend-lib/test/globalSetup.ts",
      setupFilesAfterEnv: [
        "<rootDir>/packages/backend-lib/test/setup.ts",
        "jest-expect-message",
      ],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "<rootDir>/packages/api/tsconfig.json",
          },
        ],
      },
    },
    {
      ...BASE_CONFIG,
      displayName: "emailo",
      roots: ["<rootDir>/packages/emailo/src"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "<rootDir>/packages/emailo/tsconfig.json",
          },
        ],
      },
    },
  ],
};

module.exports = config;
