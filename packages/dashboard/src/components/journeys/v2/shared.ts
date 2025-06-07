import { Static, Type } from "@sinclair/typebox";
import { createContext, useContext } from "react";
import { Updater } from "use-immer";

export const JourneyV2StepKeys = {
  EDITOR: "EDITOR",
  SUMMARY: "SUMMARY",
} as const;

export const JourneyV2StepKey = Type.KeyOf(Type.Const(JourneyV2StepKeys));

export type JourneyV2StepKey = Static<typeof JourneyV2StepKey>;

export const JOURNEY_V2_STEPS = [
  {
    key: JourneyV2StepKeys.EDITOR,
    name: "Editor",
  },
  {
    key: JourneyV2StepKeys.SUMMARY,
    name: "Summary",
    afterStart: true,
  },
] as const satisfies readonly JourneyV2Step[];

export interface JourneyV2Step {
  key: JourneyV2StepKey;
  name: string;
  afterStart?: true;
}

export interface JourneyV2State {
  id: string;
  step: JourneyV2StepKey;
}

export interface JourneyV2ContextValue {
  state: JourneyV2State;
  setState: Updater<JourneyV2State>;
}

export const JourneyV2Context = createContext<JourneyV2ContextValue | null>(
  null,
);

export function useJourneyV2Context() {
  const context = useContext(JourneyV2Context);
  if (!context) {
    throw new Error(
      "useJourneyV2Context must be used within a JourneyV2Provider",
    );
  }
  return context;
}
