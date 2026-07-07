import { shouldSkipRealtimeSegmentJob } from "./worker";

describe("shouldSkipRealtimeSegmentJob", () => {
  it("skips jobs without a userId", () => {
    expect(shouldSkipRealtimeSegmentJob({ userId: undefined })).toBe(true);
    expect(shouldSkipRealtimeSegmentJob({ userId: "" })).toBe(true);
  });

  it("processes jobs with a userId", () => {
    expect(shouldSkipRealtimeSegmentJob({ userId: "user-1" })).toBe(false);
  });
});
