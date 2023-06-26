import axios from "axios";
import logger from "backend-lib/src/logger";
import fs from "fs/promises";
import path from "path";
import * as R from "remeda";

import { spawnWithEnv } from "./spawn";

const APPS_API_PREFIX = "/api/public/apps/";

interface SdkLanguage {
  package: string;
  openApiGeneratorLang: string;
}

export const SDK_LANGUAGES = {
  js: {
    package: "sdk-js-base",
    openApiGeneratorLang: "typescript-axios",
  },
} as const;

export async function sdkBaseCodegen({ lang }: { lang: string }) {
  let sdkLang: SdkLanguage;
  switch (lang) {
    case "js":
      sdkLang = SDK_LANGUAGES.js;
      break;
    default:
      throw new Error(`Invalid language: ${lang}`);
  }
  logger().info(`Generating api client for ${sdkLang.package}`);
  const schema = (await axios.get("http://localhost:3001/documentation/json"))
    .data;

  const restrictedPaths = R.pickBy(schema.paths, (_val, key) =>
    (key as string).startsWith(APPS_API_PREFIX)
  );
  const restrictedSchema = {
    paths: restrictedPaths,
    ...R.omit(schema, ["paths"]),
  };

  const baseDir = path.join(__dirname, "..", "..", "..");
  const schemaPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    ".tmp",
    "open-api-apps.json"
  );

  await fs.writeFile(schemaPath, JSON.stringify(restrictedSchema, null, 2));

  const outputDir = path.join(
    baseDir,
    "packages",
    sdkLang.package,
    "src",
    "client"
  );
  await spawnWithEnv([
    "swagger-codegen",
    "generate",
    "-i",
    schemaPath,
    "-l",
    sdkLang.openApiGeneratorLang,
    "-o",
    outputDir,
  ]);
}
