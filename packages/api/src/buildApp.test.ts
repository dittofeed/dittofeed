import { readFile } from "fs/promises";
import buildApp from "./buildApp";
import { JSONValue } from "isomorphic-lib/src/types";
import path from "path";

describe("swagger", () => {
  describe("when initializing swagger config", () => {
    let config: JSONValue;
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      config = JSON.parse(
        await readFile(
          path.join(__dirname, "..", "..", "docs", "open-api.json"),
          "utf-8"
        )
      );
      app = await buildApp();
    });
    it("should should return the same value present in docs", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const swagger = JSON.parse(JSON.stringify(app.swagger()));
      expect(swagger).toEqual(config);
    });
  });
});
