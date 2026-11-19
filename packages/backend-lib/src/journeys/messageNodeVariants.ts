import { MessageNodeVariant } from "isomorphic-lib/src/types";

/**
 * Which arm of a message A/B test a recipient belongs to.
 *
 * This is a pure function over the recipient and the node, deliberately free of
 * randomness: a workflow that re-runs, replays, or is retried has to pick the
 * same arm again, and a recipient who enters the journey twice should not be
 * shown a different arm the second time. Temporal also forbids the
 * non-deterministic APIs (`Math.random`, `crypto`), so the hash is computed with
 * plain arithmetic.
 */

/* eslint-disable no-bitwise -- An integer hash is bitwise by construction. */
// FNV-1a followed by the murmur3 finalizer. Plain FNV-1a leaves the high bits
// almost untouched by the last character, which clusters sequential ids like
// `user-1`, `user-2` into the same arm; the finalizer avalanches them across the
// whole range. Stable across Node versions and not used for anything security
// related.
function hashBucketValue(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * The recipient's position in the range `[0, 1)`, derived from the workspace,
 * journey, node and recipient. Including the node means two message nodes in
 * the same journey split their audiences independently, instead of sending the
 * same people the first arm of every test.
 */
export function variantAssignmentBucket({
  workspaceId,
  journeyId,
  nodeId,
  userId,
}: {
  workspaceId: string;
  journeyId: string;
  nodeId: string;
  userId: string;
}): number {
  const hash = hashBucketValue(
    `${workspaceId}:${journeyId}:${nodeId}:${userId}`,
  );
  return hash / 0x100000000;
}

/**
 * The arm covering a given position. Weights are relative rather than
 * percentages, so `[{weight: 1}, {weight: 3}]` is a 25/75 split. Weights that
 * are zero or negative never win, and a set whose weights sum to zero is split
 * evenly instead of starving every arm.
 */
export function selectMessageNodeVariant({
  variants,
  bucket,
}: {
  variants: MessageNodeVariant[];
  bucket: number;
}): MessageNodeVariant | undefined {
  if (variants.length === 0) {
    return undefined;
  }
  const positiveWeights = variants.map((variant) =>
    Number.isFinite(variant.weight) && variant.weight > 0 ? variant.weight : 0,
  );
  const totalWeight = positiveWeights.reduce((sum, weight) => sum + weight, 0);
  const weights =
    totalWeight > 0 ? positiveWeights : variants.map(() => 1 / variants.length);

  const target = bucket * (totalWeight > 0 ? totalWeight : 1);
  let cumulative = 0;
  for (let index = 0; index < variants.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (weight <= 0) {
      continue;
    }
    cumulative += weight;
    if (target < cumulative) {
      return variants[index];
    }
  }
  // Only reachable through floating point drift at the very top of the range.
  for (let index = variants.length - 1; index >= 0; index -= 1) {
    if ((weights[index] ?? 0) > 0) {
      return variants[index];
    }
  }
  return variants[variants.length - 1];
}

/**
 * The arm a recipient gets, or undefined when the node has no variants and
 * should send its plain `variant`.
 */
export function pickMessageNodeVariant({
  variants,
  workspaceId,
  journeyId,
  nodeId,
  userId,
}: {
  variants: MessageNodeVariant[] | undefined;
  workspaceId: string;
  journeyId: string;
  nodeId: string;
  userId: string;
}): MessageNodeVariant | undefined {
  if (!variants || variants.length === 0) {
    return undefined;
  }
  return selectMessageNodeVariant({
    variants,
    bucket: variantAssignmentBucket({ workspaceId, journeyId, nodeId, userId }),
  });
}

/**
 * The label an arm is recorded under in message tags and provider metadata.
 * Falls back to the id so an unnamed arm is still distinguishable in analytics.
 */
export function messageNodeVariantLabel(variant: MessageNodeVariant): string {
  const name = variant.name?.trim();
  return name && name.length > 0 ? name : variant.id;
}
/* eslint-enable no-bitwise */
