import { SxProps, Theme } from "@mui/material";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  BroadcastConfiguration,
  BroadcastStepKey,
  BroadcastStepKeys,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo } from "react";
import { useImmer } from "use-immer";

import BroadcastLayout from "./broadcasts/broadcastsLayoutV2";
import {
  BroadcastQueryKeys,
  BroadcastState,
  BroadcastStateUpdater,
  ExposedBroadcastState,
  useBroadcastSteps,
} from "./broadcasts/broadcastsShared";
import Configuration from "./broadcasts/configuration";
import Content from "./broadcasts/content";
import Deliveries from "./broadcasts/deliveries";
import Events from "./broadcasts/events";
import Recipients from "./broadcasts/recipients";

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

type QueryState = Partial<Pick<BroadcastState, "step">>;

function stateToQueryParams(state: QueryState): Record<string, string> {
  const queryParams: Record<string, string> = {};
  if (state.step) {
    queryParams[BroadcastQueryKeys.STEP] = state.step;
  }
  return queryParams;
}

export default function Broadcast({
  queryParams,
  onStateChange,
  configuration,
  sx,
}: {
  queryParams: Record<string, string | string[] | undefined>;
  onStateChange?: (state: ExposedBroadcastState) => void;
  configuration?: Omit<BroadcastConfiguration, "type">;
  sx?: SxProps<Theme>;
}) {
  const router = useRouter();
  const stateFromQueryParams = useMemo(
    () => queryParamsToState(queryParams),
    [queryParams],
  );
  const steps = useBroadcastSteps(configuration?.stepsAllowList);

  const { id } = queryParams;
  const initialStep = stateFromQueryParams.step ?? steps[0]?.key;
  if (!initialStep) {
    throw new Error("Application error: no steps available");
  }
  const [state, updateState] = useImmer<BroadcastState | null>(
    id && typeof id === "string"
      ? {
          id,
          step: initialStep,
          configuration,
          steps,
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

  const queryHash = useMemo(() => {
    return JSON.stringify(router.query);
  }, [router.query]);

  const newQuery = useMemo(() => {
    const queryState: QueryState = {
      step: state?.step,
    };
    const qp = stateToQueryParams(queryState);
    return { ...router.query, ...qp };
  }, [state?.step, queryHash]);

  useEffect(() => {
    router.push({ query: newQuery }, undefined, { shallow: true });
  }, [newQuery]);

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
      content = <Recipients state={state} />;
      break;
    case BroadcastStepKeys.CONTENT:
      content = <Content state={state} />;
      break;
    case BroadcastStepKeys.CONFIGURATION:
      content = (
        <Configuration state={state} updateState={updateStateWithoutNull} />
      );
      break;
    case BroadcastStepKeys.DELIVERIES:
      content = <Deliveries state={state} />;
      break;
    case BroadcastStepKeys.EVENTS:
      content = <Events state={state} />;
      break;
  }

  return (
    <BroadcastLayout state={state} updateState={updateStateWithoutNull} sx={sx}>
      {content}
    </BroadcastLayout>
  );
}
