import { readFile } from "fs/promises";
import path from "path";
import { omit } from "remeda";

import buildApp from "./buildApp";

describe("swagger", () => {
  describe("when initializing swagger config", () => {
    let config: Record<string, unknown>;
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      config = JSON.parse(
        await readFile(
          path.join(__dirname, "..", "..", "docs", "open-api.json"),
          "utf-8",
        ),
      );
      app = await buildApp();
    });
    it("should should return the same value present in docs", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const swagger = omit(JSON.parse(JSON.stringify(app.swagger())), [
        "servers",
      ]);
      expect(swagger).toEqual(omit(config, ["servers"]));
    });
  });
});
