import { differenceInHours } from "date-fns";

import { findNextLocalizedTimeInner } from "./dates";

describe("findNextLocalizedTimeInner", () => {
  describe("when localizing to disneyland time at 8 pm it", () => {
    it("shows a 4 hours difference when localizing from 12 am UTC", () => {
      // slightly after 4 pm in los angeles time
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();
      const result = findNextLocalizedTimeInner({
        latLon: "33.8121,-117.9190",
        now,
        hour: 20,
      });
      expect(result).toBeGreaterThan(now);
      expect(differenceInHours(result, now)).toBe(4);
    });
  });

  describe("when localizing to tokyo time at 6 am", () => {
    it("shows a 20 hour difference", () => {
      // slightly after 8 am in tokyo time
      const now = new Date("2023-12-19T23:00:12.12Z").getTime();

      const result = findNextLocalizedTimeInner({
        latLon: "35.6764,139.6500",
        now,
        hour: 5,
      });
      expect(result).toBeGreaterThan(now);
      expect(differenceInHours(result, now)).toBe(20);
    });
    describe("when also required to be on a Thursday", () => {
      it("shows a 44 hour difference when starting from Thursday", () => {
        // slightly after 8 am in tokyo time
        const now = new Date("2023-12-19T23:00:12.12Z").getTime();

        const result = findNextLocalizedTimeInner({
          latLon: "35.6764,139.6500",
          now,
          hour: 5,
          allowedDaysOfWeek: [4],
        });
        expect(result).toBeGreaterThan(now);
        expect(differenceInHours(result, now)).toBe(44);
      });
    });
  });

  it("when localizing to tokyo time at 6 am on Thursday ", () => {
    // slightly after 8 am in tokyo time
    const now = new Date("2023-12-19T23:00:12.12Z").getTime();

    const result = findNextLocalizedTimeInner({
      latLon: "35.6764,139.6500",
      now,
      hour: 5,
    });
    expect(result).toBeGreaterThan(now);
    expect(differenceInHours(result, now)).toBe(20);
  });
});
