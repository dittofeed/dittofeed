import { randomUUID } from "crypto";
import { PII_MASKED } from "isomorphic-lib/src/pii";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { insert } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import {
  createPiiFields,
  deletePiiFieldsByIds,
  getPiiFields,
  getPiiPolicy,
  isPiiField,
  listPiiAccessAudit,
  maskDeliveryItem,
  maskJsonString,
  maskRecord,
  maskUserEvent,
  maskUserProperties,
  PiiPolicy,
  recordPiiAccess,
  updatePiiField,
} from "./pii";
import { Workspace } from "./types";

function makePolicy({
  userProperties = [],
  eventProperties = [],
  columns = [],
}: {
  userProperties?: string[];
  eventProperties?: string[];
  columns?: string[];
}): PiiPolicy {
  return {
    workspaceId: "workspace",
    byScope: {
      UserProperty: new Set(userProperties.map((f) => f.toLowerCase())),
      EventProperty: new Set(eventProperties.map((f) => f.toLowerCase())),
      Column: new Set(columns.map((f) => f.toLowerCase())),
    },
  };
}

describe("pii", () => {
  describe("maskRecord", () => {
    it("masks registered top level fields", () => {
      const { record, maskedFieldNames } = maskRecord({
        record: { email: "a@b.com", name: "Ada" },
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
      });

      expect(record).toEqual({ email: PII_MASKED, name: "Ada" });
      expect(maskedFieldNames).toEqual(["email"]);
    });

    it("masks nested fields addressed with dot paths", () => {
      const { record, maskedFieldNames } = maskRecord({
        record: { address: { zip: "12345", city: "Berlin" }, id: "1" },
        policy: makePolicy({ eventProperties: ["address.zip"] }),
        scope: "EventProperty",
      });

      expect(record).toEqual({
        address: { zip: PII_MASKED, city: "Berlin" },
        id: "1",
      });
      expect(maskedFieldNames).toEqual(["address.zip"]);
    });

    it("does not mutate the input record", () => {
      const input = { email: "a@b.com" };
      maskRecord({
        record: input,
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
      });

      expect(input).toEqual({ email: "a@b.com" });
    });

    it("reports masked fields without changing values when apply is false", () => {
      const input = { email: "a@b.com" };
      const { record, maskedFieldNames } = maskRecord({
        record: input,
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
        apply: false,
      });

      expect(record).toBe(input);
      expect(input).toEqual({ email: "a@b.com" });
      expect(maskedFieldNames).toEqual(["email"]);
    });

    it("returns the original record when no fields are registered", () => {
      const input = { email: "a@b.com" };
      const { record, maskedFieldNames } = maskRecord({
        record: input,
        policy: makePolicy({}),
        scope: "EventProperty",
      });

      expect(record).toBe(input);
      expect(maskedFieldNames).toEqual([]);
    });

    it("ignores registered fields absent from the record", () => {
      const { record, maskedFieldNames } = maskRecord({
        record: { name: "Ada" },
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
      });

      expect(record).toEqual({ name: "Ada" });
      expect(maskedFieldNames).toEqual([]);
    });

    it("scopes fields to the requested scope", () => {
      const { record, maskedFieldNames } = maskRecord({
        record: { email: "a@b.com" },
        policy: makePolicy({ userProperties: ["email"] }),
        scope: "EventProperty",
      });

      expect(record).toEqual({ email: "a@b.com" });
      expect(maskedFieldNames).toEqual([]);
    });
  });

  describe("maskJsonString", () => {
    it("masks registered fields inside a JSON string", () => {
      const { value, maskedFieldNames } = maskJsonString({
        json: JSON.stringify({ email: "a@b.com", plan: "pro" }),
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
      });

      expect(JSON.parse(value)).toEqual({ email: PII_MASKED, plan: "pro" });
      expect(maskedFieldNames).toEqual(["email"]);
    });

    it("returns the original string for invalid JSON", () => {
      const { value, maskedFieldNames } = maskJsonString({
        json: "not-json",
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
      });

      expect(value).toBe("not-json");
      expect(maskedFieldNames).toEqual([]);
    });

    it("returns the original string when nothing matches", () => {
      const json = JSON.stringify({ plan: "pro" });
      const { value, maskedFieldNames } = maskJsonString({
        json,
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
      });

      expect(value).toBe(json);
      expect(maskedFieldNames).toEqual([]);
    });

    it("reports fields without rewriting the string when apply is false", () => {
      const json = JSON.stringify({ email: "a@b.com" });
      const { value, maskedFieldNames } = maskJsonString({
        json,
        policy: makePolicy({ eventProperties: ["email"] }),
        scope: "EventProperty",
        apply: false,
      });

      expect(value).toBe(json);
      expect(maskedFieldNames).toEqual(["email"]);
    });
  });

  describe("maskUserProperties", () => {
    it("masks properties whose name matches a registered user property", () => {
      const properties = {
        "prop-1": { name: "Email", value: "a@b.com" },
        "prop-2": { name: "Plan", value: "pro" },
      };
      const { properties: masked, maskedFieldNames } = maskUserProperties({
        properties,
        policy: makePolicy({ userProperties: ["email"] }),
      });

      expect(masked).toEqual({
        "prop-1": { name: "Email", value: PII_MASKED, piiMasked: true },
        "prop-2": { name: "Plan", value: "pro" },
      });
      expect(maskedFieldNames).toEqual(["Email"]);
      // source object untouched
      expect(properties["prop-1"].value).toBe("a@b.com");
    });

    it("matches case insensitively", () => {
      const { properties: masked } = maskUserProperties({
        properties: { "prop-1": { name: "EMAIL", value: "a@b.com" } },
        policy: makePolicy({ userProperties: ["Email"] }),
      });

      expect(masked["prop-1"]?.value).toBe(PII_MASKED);
    });

    it("returns the original map when nothing matches", () => {
      const properties = { "prop-1": { name: "Plan", value: "pro" } };
      const { properties: masked, maskedFieldNames } = maskUserProperties({
        properties,
        policy: makePolicy({ userProperties: ["email"] }),
      });

      expect(masked).toBe(properties);
      expect(maskedFieldNames).toEqual([]);
    });

    it("reports masked fields without changing values when apply is false", () => {
      const properties = { "prop-1": { name: "Email", value: "a@b.com" } };
      const { properties: masked, maskedFieldNames } = maskUserProperties({
        properties,
        policy: makePolicy({ userProperties: ["email"] }),
        apply: false,
      });

      expect(masked).toBe(properties);
      expect(maskedFieldNames).toEqual(["Email"]);
    });
  });

  describe("maskUserEvent", () => {
    const baseEvent = {
      traits: JSON.stringify({ email: "a@b.com", plan: "pro" }),
      context: JSON.stringify({ ip: "1.2.3.4" }),
      userId: "user-1",
      anonymousId: "anon-1",
    };

    it("masks traits, context and identifier columns", () => {
      const { event, maskedFieldNames } = maskUserEvent({
        event: baseEvent,
        policy: makePolicy({
          eventProperties: ["email", "context.ip", "ip"],
          columns: ["UserEvents.userId", "UserEvents.anonymousId"],
        }),
      });

      expect(JSON.parse(event.traits)).toEqual({
        email: PII_MASKED,
        plan: "pro",
      });
      expect(JSON.parse(event.context ?? "{}")).toEqual({ ip: PII_MASKED });
      expect(event.userId).toBe(PII_MASKED);
      expect(event.anonymousId).toBe(PII_MASKED);
      expect(maskedFieldNames).toEqual(
        expect.arrayContaining([
          "email",
          "ip",
          "UserEvents.userId",
          "UserEvents.anonymousId",
        ]),
      );
    });

    it("leaves identifiers alone when null", () => {
      const { event } = maskUserEvent({
        event: { ...baseEvent, userId: null, anonymousId: null },
        policy: makePolicy({ columns: ["UserEvents.userId"] }),
      });

      expect(event.userId).toBeNull();
    });

    it("does not mutate the input event", () => {
      const input = { ...baseEvent };
      maskUserEvent({
        event: input,
        policy: makePolicy({
          eventProperties: ["email"],
          columns: ["UserEvents.userId"],
        }),
      });

      expect(input.traits).toBe(baseEvent.traits);
      expect(input.userId).toBe("user-1");
    });

    it("reports masked fields without changing values when apply is false", () => {
      const input = { ...baseEvent };
      const { event, maskedFieldNames } = maskUserEvent({
        event: input,
        policy: makePolicy({
          eventProperties: ["email"],
          columns: ["UserEvents.userId"],
        }),
        apply: false,
      });

      expect(event).toBe(input);
      expect(input.traits).toBe(baseEvent.traits);
      expect(input.userId).toBe("user-1");
      expect(maskedFieldNames).toEqual(
        expect.arrayContaining(["email", "UserEvents.userId"]),
      );
    });

    it("returns the original event when the policy is empty", () => {
      const input = { ...baseEvent };
      const { event, maskedFieldNames } = maskUserEvent({
        event: input,
        policy: makePolicy({}),
      });

      expect(event).toBe(input);
      expect(maskedFieldNames).toEqual([]);
    });
  });

  describe("maskDeliveryItem", () => {
    it("masks delivery properties and column fields", () => {
      const item = {
        to: "a@b.com",
        userId: "user-1",
        email: "a@b.com",
        channel: "Email",
      };
      const { item: masked, maskedFieldNames } = maskDeliveryItem({
        item,
        policy: makePolicy({
          eventProperties: ["email"],
          columns: ["Deliveries.to", "Deliveries.userId"],
        }),
      });

      expect(masked).toEqual({
        to: PII_MASKED,
        userId: PII_MASKED,
        email: PII_MASKED,
        channel: "Email",
      });
      expect(maskedFieldNames).toEqual(
        expect.arrayContaining(["email", "Deliveries.to", "Deliveries.userId"]),
      );
    });

    it("reports masked fields without changing values when apply is false", () => {
      const item = { to: "a@b.com", userId: "user-1" };
      const { item: masked, maskedFieldNames } = maskDeliveryItem({
        item,
        policy: makePolicy({
          columns: ["Deliveries.to", "Deliveries.userId"],
        }),
        apply: false,
      });

      expect(masked).toBe(item);
      expect(item).toEqual({ to: "a@b.com", userId: "user-1" });
      expect(maskedFieldNames).toEqual(["Deliveries.to", "Deliveries.userId"]);
    });
  });

  describe("with a workspace", () => {
    let workspace: Workspace;

    beforeEach(async () => {
      workspace = unwrap(
        await insert({
          table: dbWorkspace,
          values: {
            id: randomUUID(),
            name: `workspace-${randomUUID()}`,
            updatedAt: new Date(),
          },
        }),
      );
    });

    it("returns an empty policy for a workspace without fields", async () => {
      const policy = await getPiiPolicy(workspace.id);

      expect(isPiiField(policy, "UserProperty", "email")).toBe(false);
      expect(isPiiField(policy, "EventProperty", "email")).toBe(false);
      expect(isPiiField(policy, "Column", "Deliveries.to")).toBe(false);
    });

    it("round trips fields through the policy", async () => {
      await createPiiFields({
        workspaceId: workspace.id,
        fields: [
          { scope: "UserProperty", name: "Email", category: "Email" },
          { scope: "EventProperty", name: "phone" },
          { scope: "Column", name: "Deliveries.to" },
        ],
      });

      const policy = await getPiiPolicy(workspace.id);

      expect(isPiiField(policy, "UserProperty", "email")).toBe(true);
      expect(isPiiField(policy, "EventProperty", "Phone")).toBe(true);
      expect(isPiiField(policy, "Column", "deliveries.to")).toBe(true);
      // default category
      const fields = await getPiiFields({ workspaceId: workspace.id });
      const phone = fields.find((f) => f.name === "phone");
      expect(phone?.category).toBe("Other");
    });

    it("ignores duplicate fields", async () => {
      await createPiiFields({
        workspaceId: workspace.id,
        fields: [{ scope: "UserProperty", name: "email" }],
      });
      await createPiiFields({
        workspaceId: workspace.id,
        fields: [{ scope: "UserProperty", name: "email" }],
      });

      const fields = await getPiiFields({
        workspaceId: workspace.id,
        scope: "UserProperty",
      });
      expect(fields).toHaveLength(1);
    });

    it("updates a field category and deletes by id", async () => {
      await createPiiFields({
        workspaceId: workspace.id,
        fields: [{ scope: "UserProperty", name: "email" }],
      });
      const [field] = await getPiiFields({ workspaceId: workspace.id });
      if (!field) {
        throw new Error("expected field");
      }

      const updated = await updatePiiField({
        workspaceId: workspace.id,
        id: field.id,
        category: "Email",
      });
      expect(updated).toBe(true);

      const [afterUpdate] = await getPiiFields({ workspaceId: workspace.id });
      expect(afterUpdate?.category).toBe("Email");

      const deleted = await deletePiiFieldsByIds({
        workspaceId: workspace.id,
        ids: [field.id],
      });
      expect(deleted).toBe(1);
      expect(await getPiiFields({ workspaceId: workspace.id })).toHaveLength(0);
    });

    it("isolates fields by workspace", async () => {
      const other = unwrap(
        await insert({
          table: dbWorkspace,
          values: {
            id: randomUUID(),
            name: `workspace-${randomUUID()}`,
            updatedAt: new Date(),
          },
        }),
      );
      await createPiiFields({
        workspaceId: other.id,
        fields: [{ scope: "UserProperty", name: "email" }],
      });

      const policy = await getPiiPolicy(workspace.id);
      expect(isPiiField(policy, "UserProperty", "email")).toBe(false);
    });

    describe("recordPiiAccess", () => {
      it("does not audit viewers without the unmask permission", async () => {
        await recordPiiAccess({
          viewer: { workspaceId: workspace.id, unmaskPii: false },
          action: "ViewUsers",
          scope: "UserProperty",
          fields: ["email"],
          resourceIds: ["user-1"],
        });

        const { audits } = await listPiiAccessAudit({
          workspaceId: workspace.id,
        });
        expect(audits).toHaveLength(0);
      });

      it("records one audit row per field for unmasking viewers", async () => {
        await recordPiiAccess({
          viewer: { workspaceId: workspace.id, unmaskPii: true },
          action: "ViewUsers",
          scope: "UserProperty",
          fields: ["email", "phone"],
          resourceIds: ["user-1", "user-2"],
        });

        const { audits } = await listPiiAccessAudit({
          workspaceId: workspace.id,
        });
        expect(audits).toHaveLength(2);
        for (const audit of audits) {
          expect(audit.action).toBe("ViewUsers");
          expect(audit.recordCount).toBe(2);
          expect(audit.resourceIds).toEqual(["user-1", "user-2"]);
        }
        expect(audits.map((a) => a.fieldName).sort()).toEqual([
          "email",
          "phone",
        ]);
      });

      it("does nothing when there are no fields", async () => {
        await recordPiiAccess({
          viewer: { workspaceId: workspace.id, unmaskPii: true },
          action: "ViewUsers",
          scope: "UserProperty",
          fields: [],
          resourceIds: ["user-1"],
        });

        const { audits } = await listPiiAccessAudit({
          workspaceId: workspace.id,
        });
        expect(audits).toHaveLength(0);
      });
    });

    describe("listPiiAccessAudit", () => {
      it("paginates by createdAt cursor", async () => {
        for (let i = 0; i < 3; i += 1) {
          // Sequential on purpose: the cursor is `createdAt`, so rows must get
          // distinct timestamps for pagination to be observable.
          // eslint-disable-next-line no-await-in-loop
          await recordPiiAccess({
            viewer: { workspaceId: workspace.id, unmaskPii: true },
            action: `Action${i}`,
            scope: "UserProperty",
            fields: ["email"],
            resourceIds: ["user-1"],
          });
        }

        const first = await listPiiAccessAudit({
          workspaceId: workspace.id,
          limit: 2,
        });
        expect(first.audits).toHaveLength(2);
        expect(first.nextCursor).toBeDefined();

        const second = await listPiiAccessAudit({
          workspaceId: workspace.id,
          limit: 2,
          cursor: first.nextCursor,
        });
        expect(second.audits).toHaveLength(1);
        expect(second.nextCursor).toBeUndefined();
      });
    });
  });
});
