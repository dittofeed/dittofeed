import { openapiV31 } from "@apidevtools/openapi-schemas";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFile } from "fs/promises";
import path from "path";
import { omit } from "remeda";

import buildApp from "./buildApp";

describe("swagger", () => {
  describe("when initializing swagger config", () => {
    let config: Record<string, unknown>;
    let app: Awaited<ReturnType<typeof buildApp>>;
    let ajv: Ajv;
    let openapiDraft: unknown;

    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      config = JSON.parse(
        await readFile(
          path.join(__dirname, "..", "..", "docs", "open-api.json"),
          "utf-8",
        ),
      );
      openapiDraft = JSON.parse(
        await readFile(
          path.join(__dirname, "..", "test", "openapiDraft202012.json"),
          "utf-8",
        ),
      );
      app = await buildApp();
      ajv = new Ajv({
        allErrors: true,
      });
      addFormats(ajv);
    });

    it.only("the swagger config should be valid", () => {
      const validate = ajv.compile(openapiV31);
      const valid = validate(app.swagger());
      expect(validate.errors).toBeUndefined();
      expect(valid).toBe(true);
    });

    it("the swagger config should match the config present in docs", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const swagger = omit(JSON.parse(JSON.stringify(app.swagger())), [
        "servers",
      ]);
      expect(
        swagger,
        "To fix this test, update the docs by following these instructions: https://docs.dittofeed.com/contributing/updating-api-docs",
      ).toEqual(omit(config, ["servers"]));
    });
  });
});
