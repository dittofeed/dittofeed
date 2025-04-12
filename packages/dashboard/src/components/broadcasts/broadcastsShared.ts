import { Static, Type } from "@sinclair/typebox";
import { Updater } from "use-immer";

export const BroadcastStepKeys = {
  RECIPIENTS: "RECIPIENTS",
  CONTENT: "CONTENT",
  CONFIGURATION: "CONFIGURATION",
  PREVIEW: "PREVIEW",
  REVIEW: "REVIEW",
} as const;

export const BroadcastStepKey = Type.KeyOf(Type.Const(BroadcastStepKeys));

export type BroadcastStepKey = Static<typeof BroadcastStepKey>;

export interface BroadcastStep {
  key: BroadcastStepKey;
  name: string;
  afterDraft?: true;
}

export const BROADCAST_STEPS = [
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
    key: BroadcastStepKeys.PREVIEW,
    name: "Preview",
  },
  {
    key: BroadcastStepKeys.REVIEW,
    name: "Review",
    afterDraft: true,
  },
] as const satisfies BroadcastStep[];

export interface BroadcastState {
  step: BroadcastStepKey;
}

export type ExposedBroadcastState = Pick<BroadcastState, "step">;

export type BroadcastStateUpdater = Updater<BroadcastState>;

export const BroadcastQueryKeys = {
  STEP: "dfbs",
} as const;
