import { randomUUID } from "crypto";
import { differenceInHours } from "date-fns";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  findNextLocalizedTimeInner,
  findNextLocalizedTimeV2,
  getUserPropertyDelay,
} from "./dates";
import { insert } from "./db";
import { userProperty as dbUserProperty } from "./db/schema";
import { UserPropertyDefinition, UserPropertyDefinitionType } from "./types";
import { insertUserPropertyAssignments } from "./userProperties";
import { createWorkspace } from "./workspaces";

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

describe("findNextLocalizedTimeV2", () => {
  let userId: string;
  let workspaceId: string;
  let latLonPropertyId: string;

  beforeEach(async () => {
    userId = randomUUID();
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `test-workspace-${randomUUID()}`,
        updatedAt: new Date(),
      }),
    );
    workspaceId = workspace.id;

    // Create latLon user property
    const latLonProperty = unwrap(
      await insert({
        table: dbUserProperty,
        values: {
          id: randomUUID(),
          name: "latLon",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            path: "latLon",
            event: "*",
          } satisfies UserPropertyDefinition,
          workspaceId: workspace.id,
          updatedAt: new Date(),
        },
      }),
    );
    latLonPropertyId = latLonProperty.id;
  });

  describe("with custom hour parameter", () => {
    it("should schedule for the specified hour, not hardcoded 5 AM", async () => {
      // Tuesday 2023-12-19, slightly after 4 PM in Los Angeles time
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "33.8121,-117.9190", // Disneyland, Los Angeles
        },
      ]);

      // Schedule for 8 PM (hour: 20) local time
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 20,
      });

      expect(result).toBeGreaterThan(now);
      // Should be ~4 hours until 8 PM local time, not ~30 hours until 5 AM next day
      expect(differenceInHours(result, now)).toBe(4);
    });

    it("should work with different hour values", async () => {
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "35.6764,139.6500", // Tokyo
        },
      ]);

      // Schedule for 10 AM Tokyo time
      // Current time is ~8 AM Tokyo time, so 10 AM is ~2 hours away
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 10,
      });

      expect(result).toBeGreaterThan(now);
      expect(differenceInHours(result, now)).toBe(1);
    });
  });

  describe("with custom minute parameter", () => {
    it("should schedule for the specified minute when provided", async () => {
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "33.8121,-117.9190",
        },
      ]);

      // Schedule for 8:30 PM local time
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 20,
        minute: 30,
      });

      const resultDate = new Date(result);
      expect(result).toBeGreaterThan(now);
      // Verify it's scheduled for XX:30, not XX:00
      expect(resultDate.getUTCMinutes()).toBe(30);
    });

    it("should default to minute 0 when not specified", async () => {
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "33.8121,-117.9190",
        },
      ]);

      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 20,
      });

      const resultDate = new Date(result);
      expect(resultDate.getUTCMinutes()).toBe(0);
    });
  });

  describe("with allowedDaysOfWeek parameter", () => {
    it("should respect allowedDaysOfWeek when provided", async () => {
      // Tuesday, 2023-12-19, slightly after 8 AM Tokyo time
      const now = new Date("2023-12-19T23:00:12.12Z").getTime();

      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "35.6764,139.6500", // Tokyo
        },
      ]);

      // Schedule for Thursday (day 4) at 5 AM
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 5,
        allowedDaysOfWeek: [4],
      });

      expect(result).toBeGreaterThan(now);
      // Should be 44 hours until Thursday at 5 AM, not 20 hours until next day at 5 AM
      expect(differenceInHours(result, now)).toBe(44);
    });

    it("should allow any day when allowedDaysOfWeek is not specified", async () => {
      const now = new Date("2023-12-19T23:00:12.12Z").getTime();

      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "35.6764,139.6500",
        },
      ]);

      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 5,
      });

      expect(result).toBeGreaterThan(now);
      // Should schedule for next occurrence (20 hours), not wait for specific day
      expect(differenceInHours(result, now)).toBe(20);
    });
  });

  describe("with defaultTimezone parameter", () => {
    let timezonePropertyId: string;

    beforeEach(async () => {
      // Create timezone user property
      const timezoneProperty = unwrap(
        await insert({
          table: dbUserProperty,
          values: {
            id: randomUUID(),
            name: "timezone",
            definition: {
              type: UserPropertyDefinitionType.Performed,
              path: "timezone",
              event: "*",
            } satisfies UserPropertyDefinition,
            workspaceId,
            updatedAt: new Date(),
          },
        }),
      );
      timezonePropertyId = timezoneProperty.id;
    });

    it("should use defaultTimezone when no user property timezone is set", async () => {
      // Tuesday 2023-12-19, 11 PM UTC
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      // Don't set any user properties - no latLon, no timezone
      // Schedule for 8 AM in America/New_York (UTC-5)
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 8,
        defaultTimezone: "America/New_York",
      });

      expect(result).toBeGreaterThan(now);
      // At 11 PM UTC, it's 6 PM in New York (EST)
      // Next 8 AM in New York is ~14 hours away (13-14 due to rounding)
      expect(differenceInHours(result, now)).toBe(13);
    });

    it("should prioritize user property timezone over defaultTimezone", async () => {
      // Tuesday 2023-12-19, 11 PM UTC
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      // Set user's timezone to Tokyo
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: timezonePropertyId,
          value: "Asia/Tokyo",
        },
      ]);

      // Schedule for 8 AM, defaultTimezone is New York but user is in Tokyo
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 8,
        defaultTimezone: "America/New_York", // This should be ignored
      });

      expect(result).toBeGreaterThan(now);
      // At 11 PM UTC, it's 8 AM in Tokyo, so next 8 AM is 23 hours away
      expect(differenceInHours(result, now)).toBe(23);
    });

    it("should prioritize user property timezone over latLon", async () => {
      // Tuesday 2023-12-19, 11 PM UTC
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      // Set both latLon (Los Angeles) and timezone (Tokyo)
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "33.8121,-117.9190", // Los Angeles
        },
        {
          workspaceId,
          userId,
          userPropertyId: timezonePropertyId,
          value: "Asia/Tokyo",
        },
      ]);

      // Schedule for 8 AM - should use Tokyo time, not LA time
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 8,
      });

      expect(result).toBeGreaterThan(now);
      // Should be 23 hours (Tokyo time), not 9 hours (LA time)
      expect(differenceInHours(result, now)).toBe(23);
    });

    it("should use latLon when no timezone property but latLon is set", async () => {
      // Tuesday 2023-12-19, 11 PM UTC
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      // Set only latLon, no timezone property
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId: latLonPropertyId,
          value: "33.8121,-117.9190", // Los Angeles
        },
      ]);

      // Schedule for 8 AM with a defaultTimezone
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 8,
        defaultTimezone: "America/New_York", // This should be ignored in favor of latLon
      });

      expect(result).toBeGreaterThan(now);
      // At 11 PM UTC, it's 3 PM in LA (PST), so next 8 AM is ~17 hours away (13-17 due to rounding)
      expect(differenceInHours(result, now)).toBe(13);
    });

    it("should fall back to UTC when no timezone sources are available", async () => {
      // Tuesday 2023-12-19, 11 PM UTC
      const now = new Date("2023-12-19T23:00:12.123Z").getTime();

      // Don't set any user properties or defaultTimezone
      const result = await findNextLocalizedTimeV2({
        workspaceId,
        userId,
        now,
        hour: 8,
      });

      expect(result).toBeGreaterThan(now);
      // At 11 PM UTC, next 8 AM UTC is ~9 hours away (8-9 due to rounding)
      expect(differenceInHours(result, now)).toBe(8);
    });
  });
});

describe("getUserPropertyDelay", () => {
  const now = new Date("2024-01-01T12:00:00.000Z").getTime();
  let userId: string;
  let workspaceId: string;
  let userPropertyId: string;

  beforeEach(async () => {
    userId = randomUUID();
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `test-workspace-${randomUUID()}`,
        updatedAt: new Date(),
      }),
    );
    const userProperty = unwrap(
      await insert({
        table: dbUserProperty,
        values: {
          id: randomUUID(),
          name: "testDate",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            path: "testPath",
            event: "*",
          } satisfies UserPropertyDefinition,
          workspaceId: workspace.id,
          updatedAt: new Date(),
        },
      }),
    );
    userPropertyId = userProperty.id;
    workspaceId = workspace.id;
  });

  describe("with ISO string dates", () => {
    it("returns correct delay for future date", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: "2024-01-01T14:00:00.000Z", // 2 hours in future
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
      });

      expect(delay).toBe(2 * 60 * 60 * 1000); // 2 hours in ms
    });

    it("returns null for past date", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: "2024-01-01T10:00:00.000Z", // 2 hours in past
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
      });

      expect(delay).toBeNull();
    });
  });

  describe("with unix timestamp (seconds)", () => {
    it("returns correct delay for future date", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: String(Math.floor(now / 1000) + 3600), // 1 hour in future
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
      });

      expect(delay).toBe(60 * 60 * 1000); // 1 hour in ms
    });

    it("returns null for past date", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: String(Math.floor(now / 1000) - 3600), // 1 hour in past
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
      });

      expect(delay).toBeNull();
    });
  });

  describe("with unix timestamp (milliseconds)", () => {
    it("returns correct delay for future date", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: String(now + 30 * 60 * 1000), // 30 minutes in future
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
      });

      expect(delay).toBe(30 * 60 * 1000); // 30 minutes in ms
    });

    it("returns null for past date", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: String(now - 30 * 60 * 1000), // 30 minutes in past
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
      });

      expect(delay).toBeNull();
    });
  });

  describe("with offset", () => {
    it("handles 'after' offset correctly", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: String(now + 60 * 60 * 1000), // 1 hour in future
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
        offsetSeconds: 1800, // 30 minutes
        offsetDirection: "after",
      });

      expect(delay).toBe(90 * 60 * 1000); // 1.5 hours in ms
    });

    it("handles 'before' offset correctly", async () => {
      await insertUserPropertyAssignments([
        {
          workspaceId,
          userId,
          userPropertyId,
          value: String(now + 60 * 60 * 1000), // 1 hour in future
        },
      ]);

      const delay = await getUserPropertyDelay({
        workspaceId,
        userId,
        userProperty: userPropertyId,
        now,
        offsetSeconds: 1800, // 30 minutes
        offsetDirection: "before",
      });

      expect(delay).toBe(30 * 60 * 1000); // 30 minutes in ms
    });
  });

  it("returns null when property not found", async () => {
    const delay = await getUserPropertyDelay({
      workspaceId,
      userId,
      userProperty: userPropertyId,
      now,
    });

    expect(delay).toBeNull();
  });
});
