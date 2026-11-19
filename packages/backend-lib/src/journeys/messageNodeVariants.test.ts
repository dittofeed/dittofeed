import { ChannelType } from "isomorphic-lib/src/types";

import {
  messageNodeVariantLabel,
  pickMessageNodeVariant,
  selectMessageNodeVariant,
  variantAssignmentBucket,
} from "./messageNodeVariants";

const assignment = {
  workspaceId: "6233c7a5-1a55-4d05-a8bd-2b5b0a7c6a2e",
  journeyId: "6db3c1c6-5b8c-4d3a-9d1f-6a5b7c8d9e0f",
  nodeId: "b1f7c2d4-7c3a-4a6b-8f9e-0c1d2e3f4a5b",
  userId: "user-42",
};

function emailArm(id: string, weight: number, name?: string) {
  return {
    id,
    weight,
    ...(name ? { name } : {}),
    variant: {
      type: ChannelType.Email,
      templateId: `template-${id}`,
    },
  };
}

describe("message node variants", () => {
  describe("variantAssignmentBucket", () => {
    it("lands in [0, 1)", () => {
      const buckets = Array.from({ length: 50 }, (unused, index) =>
        variantAssignmentBucket({ ...assignment, userId: `user-${index}` }),
      );
      for (const bucket of buckets) {
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(1);
      }
    });

    it("is stable for the same recipient", () => {
      expect(variantAssignmentBucket(assignment)).toEqual(
        variantAssignmentBucket(assignment),
      );
    });

    it("keeps a pinned bucket so live experiments are not reshuffled", () => {
      // Changing the hash algorithm would silently move recipients between arms
      // of a running test, so the value is pinned rather than merely stable.
      expect(variantAssignmentBucket(assignment)).toEqual(0.8652339566033334);
    });

    it("splits two recipients of the same journey differently", () => {
      const buckets = new Set(
        Array.from({ length: 20 }, (unused, index) =>
          variantAssignmentBucket({ ...assignment, userId: `user-${index}` }),
        ),
      );
      expect(buckets.size).toBeGreaterThan(1);
    });

    it("gives the same recipient a different arm per node", () => {
      const first = variantAssignmentBucket({
        ...assignment,
        nodeId: "node-a",
      });
      const second = variantAssignmentBucket({
        ...assignment,
        nodeId: "node-b",
      });
      expect(first).not.toEqual(second);
    });
  });

  describe("selectMessageNodeVariant", () => {
    const even = [emailArm("a", 1, "A"), emailArm("b", 1, "B")];

    it("returns undefined without variants", () => {
      expect(selectMessageNodeVariant({ variants: [], bucket: 0.5 })).toBe(
        undefined,
      );
    });

    it("splits evenly at the midpoint", () => {
      expect(
        selectMessageNodeVariant({ variants: even, bucket: 0.49 })?.id,
      ).toEqual("a");
      expect(
        selectMessageNodeVariant({ variants: even, bucket: 0.5 })?.id,
      ).toEqual("b");
    });

    it("honours relative weights", () => {
      const weighted = [emailArm("a", 1), emailArm("b", 3)];
      expect(
        selectMessageNodeVariant({ variants: weighted, bucket: 0.24 })?.id,
      ).toEqual("a");
      expect(
        selectMessageNodeVariant({ variants: weighted, bucket: 0.25 })?.id,
      ).toEqual("b");
      expect(
        selectMessageNodeVariant({ variants: weighted, bucket: 0.99 })?.id,
      ).toEqual("b");
    });

    it("never selects an arm with a zero weight", () => {
      const variants = [emailArm("a", 1), emailArm("b", 0)];
      const selected = Array.from({ length: 100 }, (unused, index) =>
        selectMessageNodeVariant({ variants, bucket: index / 100 }),
      );
      expect(selected.every((variant) => variant?.id === "a")).toBe(true);
    });

    it("splits evenly rather than starving every arm when weights sum to zero", () => {
      const variants = [emailArm("a", 0), emailArm("b", 0)];
      expect(selectMessageNodeVariant({ variants, bucket: 0.2 })?.id).toEqual(
        "a",
      );
      expect(selectMessageNodeVariant({ variants, bucket: 0.8 })?.id).toEqual(
        "b",
      );
    });

    it("does not fall off the end of the range", () => {
      expect(
        selectMessageNodeVariant({ variants: even, bucket: 0.9999999 })?.id,
      ).toEqual("b");
    });
  });

  describe("pickMessageNodeVariant", () => {
    it("returns undefined when the node is not testing", () => {
      expect(
        pickMessageNodeVariant({ variants: undefined, ...assignment }),
      ).toBeUndefined();
    });

    it("assigns each recipient exactly one arm, deterministically", () => {
      const variants = [emailArm("a", 1, "A"), emailArm("b", 1, "B")];
      const seen = new Set<string>();
      for (let index = 0; index < 40; index += 1) {
        const userId = `user-${index}`;
        const first = pickMessageNodeVariant({
          variants,
          ...assignment,
          userId,
        });
        const second = pickMessageNodeVariant({
          variants,
          ...assignment,
          userId,
        });
        expect(first?.id).toEqual(second?.id);
        if (first) {
          seen.add(first.id);
        }
      }
      expect(seen).toEqual(new Set(["a", "b"]));
    });
  });

  describe("messageNodeVariantLabel", () => {
    it("uses the name", () => {
      expect(messageNodeVariantLabel(emailArm("a", 1, "Control"))).toEqual(
        "Control",
      );
    });

    it("trims the name", () => {
      expect(messageNodeVariantLabel(emailArm("a", 1, "  Control  "))).toEqual(
        "Control",
      );
    });

    it("falls back to the id for an unnamed arm", () => {
      expect(messageNodeVariantLabel(emailArm("arm-id", 1))).toEqual("arm-id");
      expect(messageNodeVariantLabel(emailArm("arm-id", 1, "   "))).toEqual(
        "arm-id",
      );
    });
  });
});
