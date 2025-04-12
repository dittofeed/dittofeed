import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { useEffect, useMemo } from "react";
import { useImmer } from "use-immer";

import BroadcastLayout from "./broadcasts/broadcastsLayoutV2";
import {
  BroadcastQueryKeys,
  BroadcastState,
  BroadcastStepKey,
  BroadcastStepKeys,
  ExposedBroadcastState,
} from "./broadcasts/broadcastsShared";
import Configuration from "./broadcasts/configuration";
import Content from "./broadcasts/content";
import Preview from "./broadcasts/preview";
import Recipients from "./broadcasts/recipients";
import Review from "./broadcasts/review";

function queryParamsToState(
  queryParams: Record<string, string | string[] | undefined>,
): Partial<BroadcastState> {
  const stepValue = queryParams[BroadcastQueryKeys.STEP];
  const step = schemaValidateWithErr(stepValue, BroadcastStepKey).unwrapOr(
    undefined,
  );

  return {
    step,
  };
}

export default function Broadcasts({
  queryParams,
  onStateChange,
}: {
  queryParams: Record<string, string | string[] | undefined>;
  onStateChange?: (state: ExposedBroadcastState) => void;
}) {
  const stateFromQueryParams = useMemo(
    () => queryParamsToState(queryParams),
    [queryParams],
  );

  const [state, updateState] = useImmer<BroadcastState>({
    step: stateFromQueryParams.step ?? BroadcastStepKeys.RECIPIENTS,
  });

  useEffect(() => {
    updateState((draft) => {
      if (
        stateFromQueryParams.step !== draft.step &&
        stateFromQueryParams.step !== undefined
      ) {
        draft.step = stateFromQueryParams.step;
      }
    });
  }, [stateFromQueryParams.step, updateState]);

  const exposedState = useMemo(() => {
    return {
      step: state.step,
    };
  }, [state.step]);

  useEffect(() => {
    if (onStateChange) {
      onStateChange(exposedState);
    }
  }, [exposedState, onStateChange]);
  let content: React.ReactNode;
  switch (state.step) {
    case BroadcastStepKeys.RECIPIENTS:
      content = <Recipients />;
      break;
    case BroadcastStepKeys.CONTENT:
      content = <Content />;
      break;
    case BroadcastStepKeys.CONFIGURATION:
      content = <Configuration />;
      break;
    case BroadcastStepKeys.PREVIEW:
      content = <Preview />;
      break;
    case BroadcastStepKeys.REVIEW:
      content = <Review />;
      break;
  }

  return (
    <BroadcastLayout state={state} updateState={updateState}>
      {content}
    </BroadcastLayout>
  );
}
