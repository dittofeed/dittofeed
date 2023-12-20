import { differenceInHours } from "date-fns";
import { format } from "date-fns-tz";

import { findNextLocalizedTimeInner } from "./dates";

describe("findNextLocalizedTimeInner", () => {
  it("when localizing to disneyland time at 8 pm", async () => {
    const now = new Date("2023-12-19T23:00:12.123Z").getTime();
    const result = await findNextLocalizedTimeInner({
      latLon: "33.8121,-117.9190",
      now,
      hour: 20,
    });
    if (result === null) {
      throw new Error("result is null");
    }
    expect(result).toBeGreaterThan(now);
    expect(differenceInHours(result, now)).toBe(4);
  });

  it.only("when localizing to tokyo time at 6 am", async () => {
    const now = new Date("2023-12-19T23:00:12.12Z").getTime();

    const now2 = new Date("2023-12-19T23:00:12.123Z");
    const timezone = "Asia/Tokyo";

    const formattedTime = format(now2, "yyyy-MM-dd HH:mm:ssxxx", {
      timeZone: timezone,
    });

    console.log("loc2", formattedTime); // Expected output: '2023-12-20 08:00:12+09:00'

    const result = await findNextLocalizedTimeInner({
      latLon: "35.6764,139.6500",
      now,
      hour: 5,
    });
    if (result === null) {
      throw new Error("result is null");
    }
    expect(result).toBeGreaterThan(now);
    expect(differenceInHours(result, now)).toBe(22);
  });
});
