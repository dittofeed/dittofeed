import {
  BroadcastConfiguration,
  BroadcastStepKey,
  BroadcastStepKeys,
} from "isomorphic-lib/src/types";
import { useMemo } from "react";
import { Updater } from "use-immer";

export interface BroadcastStep {
  key: BroadcastStepKey;
  name: string;
  afterDraft?: true;
}

const BROADCAST_STEPS = [
  {
    key: BroadcastStepKeys.RECIPIENTS,
    name: "Recipients",
  },
  {
    key: BroadcastStepKeys.CONTENT,
    name: "Content",
  },
  {
    key: BroadcastStepKeys.CONFIGURATION,
    name: "Configuration",
  },
  {
    key: BroadcastStepKeys.REVIEW,
    name: "Review",
    afterDraft: true,
  },
] as const satisfies readonly BroadcastStep[];

export interface BroadcastState {
  step: BroadcastStepKey;
  id: string;
  configuration?: Omit<BroadcastConfiguration, "type">;
  steps: readonly BroadcastStep[];
}

export type ExposedBroadcastState = Pick<BroadcastState, "step">;

export type BroadcastStateUpdater = Updater<BroadcastState>;

export const BroadcastQueryKeys = {
  STEP: "dfbs",
} as const;

export function useBroadcastSteps(
  stepsAllowList: BroadcastConfiguration["stepsAllowList"],
): readonly BroadcastStep[] {
  return useMemo(() => {
    if (!stepsAllowList) {
      return BROADCAST_STEPS;
    }
    const stepsAllowListSet = new Set(stepsAllowList);
    return BROADCAST_STEPS.filter((step) => {
      return stepsAllowListSet.has(step.key);
    });
  }, [stepsAllowList]);
}
