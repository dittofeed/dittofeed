import { findNextLocalizedTimeInner } from "./dates";
import { findAllUserPropertyAssignments } from "./userProperties";

describe("findNextLocalizedTimeInner", () => {
  it("should return 0 for default case", async () => {
    const now = 1703022018800;
    const result = await findNextLocalizedTimeInner({
      latLon: "33.8121,-117.9190",
      now,
      hour: 20,
    });
    expect(result).toBeGreaterThan(now);
  });
});
