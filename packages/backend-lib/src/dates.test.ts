import { randomUUID } from "crypto";
import { differenceInHours } from "date-fns";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { findNextLocalizedTimeInner, getUserPropertyDelay } from "./dates";
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
        updatedAt: new Date().toISOString(),
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
          updatedAt: new Date().toISOString(),
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
