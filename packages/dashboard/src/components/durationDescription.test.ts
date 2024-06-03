import { TimeUnitEnum } from "isomorphic-lib/src/types";

import { nearestTimeUnit } from "./durationDescription";

describe("durationDescription", () => {
  describe("nearestTimeUnit", () => {
    describe("with 86400 seconds", () => {
      test("to be days", () => {
        expect(nearestTimeUnit(86400)).toBe(TimeUnitEnum.days);
      });
    });
    describe("with 604800 seconds", () => {
      test("to be weeks", () => {
        expect(nearestTimeUnit(604800)).toBe(TimeUnitEnum.weeks);
      });
    });
  });
});
