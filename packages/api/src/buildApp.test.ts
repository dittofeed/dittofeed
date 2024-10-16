import { openapiV31 } from "@apidevtools/openapi-schemas";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFile } from "fs/promises";
import path from "path";
import { omit } from "remeda";

import buildApp from "./buildApp";

type App = Awaited<ReturnType<typeof buildApp>>;

/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return */
function getSchema(): Record<string, unknown> {
  // taken from:
  //  https://github.com/APIDevTools/swagger-parser/blob/1d9776e2445c3dfc62cf2cd63a33f3449e5ed9fa/lib/validators/schema.js#L34C1-L41C1
  // relating to the following issues:
  //  https://github.com/OAI/OpenAPI-Specification/issues/2689
  //  https://github.com/ajv-validator/ajv/issues/1573
  const schema = openapiV31 as any;
  const schemaDynamicRef = schema.$defs.schema;
  delete schemaDynamicRef.$dynamicAnchor;

  schema.$defs.components.properties.schemas.additionalProperties =
    schemaDynamicRef;
  schema.$defs.header.dependentSchemas.schema.properties.schema =
    schemaDynamicRef;
  schema.$defs["media-type"].properties.schema = schemaDynamicRef;
  schema.$defs.parameter.properties.schema = schemaDynamicRef;
  return schema;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return */

describe("swagger", () => {
  describe("when initializing swagger config", () => {
    let config: Record<string, unknown>;
    let app: App;
    let ajv: Ajv;

    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      config = JSON.parse(
        await readFile(
          path.join(__dirname, "..", "..", "docs", "open-api.json"),
          "utf-8",
        ),
      );
      app = await buildApp();
      ajv = new Ajv({
        allErrors: true,
        strict: false,
        validateFormats: false,
        allowUnionTypes: true,
      });
      addFormats(ajv);
    });

    it("the swagger config should be valid", () => {
      const validate = ajv.compile(getSchema());
      const valid = validate(app.swagger());
      const errors = validate.errors?.length;
      expect(errors).toBeFalsy();
      expect(valid).toBe(true);
    });

    it("the swagger config should match the config present in docs", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const swagger = omit(JSON.parse(JSON.stringify(app.swagger())), [
        "servers",
        "components",
        "schemas",
      ]);
      const expected = omit(config, ["servers", "components", "schemas"]);
      expect(
        swagger,
        "To fix this test, update the docs by following these instructions: https://docs.dittofeed.com/contributing/updating-api-docs",
      ).toEqual(expected);
    });
  });
});
