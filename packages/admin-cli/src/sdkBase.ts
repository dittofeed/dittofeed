import axios from "axios";
import fs from "fs/promises";
import path from "path";
import * as R from "remeda";

const APPS_API_PREFIX = "/api/public/apps/";

interface SdkLanguage {
  package: string;
  openApiGeneratorLang: string;
}

export const SDK_LANGUAGES = {
  js: {
    package: "sdk-base-js",
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
  const schema = (await axios.get("http://localhost:3001/documentation/json"))
    .data;

  const restrictedPaths = R.pickBy(schema.paths, (_val, key) =>
    (key as string).startsWith(APPS_API_PREFIX)
  );
  const restrictedSchema = {
    paths: restrictedPaths,
    ...R.omit(schema, ["paths"]),
  };

  const schemePath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    ".tmp",
    "open-api-apps.json"
  );
  await fs.writeFile(schemePath, JSON.stringify(restrictedSchema, null, 2));
}
