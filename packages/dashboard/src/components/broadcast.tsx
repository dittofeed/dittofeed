import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { useCallback, useEffect, useMemo } from "react";
import { useImmer } from "use-immer";

import BroadcastLayout from "./broadcasts/broadcastsLayoutV2";
import {
  BroadcastQueryKeys,
  BroadcastState,
  BroadcastStateUpdater,
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

  const { id } = queryParams;
  const [state, updateState] = useImmer<BroadcastState | null>(
    id && typeof id === "string"
      ? {
          id,
          step: stateFromQueryParams.step ?? BroadcastStepKeys.RECIPIENTS,
        }
      : null,
  );

  useEffect(() => {
    updateState((draft) => {
      if (!draft) {
        return;
      }
      if (
        stateFromQueryParams.step !== draft.step &&
        stateFromQueryParams.step !== undefined
      ) {
        draft.step = stateFromQueryParams.step;
      }
    });
  }, [stateFromQueryParams.step, updateState]);

  const exposedState = useMemo(() => {
    if (!state) {
      return null;
    }
    return {
      step: state.step,
    };
  }, [state]);

  useEffect(() => {
    if (!exposedState) {
      return;
    }
    if (onStateChange) {
      onStateChange(exposedState);
    }
  }, [exposedState, onStateChange]);

  const updateStateWithoutNull: BroadcastStateUpdater = useCallback(
    (updater) => {
      updateState((draft) => {
        if (draft === null) {
          return draft;
        }
        if (typeof updater !== "function") {
          return draft;
        }
        return updater(draft);
      });
    },
    [updateState],
  );

  if (state === null) {
    return null;
  }

  let content: React.ReactNode;
  switch (state.step) {
    case BroadcastStepKeys.RECIPIENTS:
      content = (
        <Recipients state={state} updateState={updateStateWithoutNull} />
      );
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
    <BroadcastLayout state={state} updateState={updateStateWithoutNull}>
      {content}
    </BroadcastLayout>
  );
}
