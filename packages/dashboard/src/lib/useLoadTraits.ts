import {
  CompletionStatus,
  GetTraitsRequest,
  GetTraitsResponse,
} from "isomorphic-lib/src/types";
import { useEffect } from "react";

import apiRequestHandlerFactory from "./apiRequestHandlerFactory";
import { useAppStorePick } from "./appStore";

export default function useLoadTraits() {
  const {
    apiBase,
    workspace,
    upsertTraits,
    getTraitsRequest,
    setGetTraitsRequest,
  } = useAppStorePick([
    "apiBase",
    "workspace",
    "upsertTraits",
    "getTraitsRequest",
    "setGetTraitsRequest",
  ]);

  useEffect(() => {
    if (workspace.type !== CompletionStatus.Successful) {
      return;
    }
    const workspaceId = workspace.value.id;
    const params: GetTraitsRequest = {
      workspaceId,
    };
    apiRequestHandlerFactory({
      request: getTraitsRequest,
      setRequest: setGetTraitsRequest,
      responseSchema: GetTraitsResponse,
      setResponse: ({ traits: t }) => upsertTraits(t),
      requestConfig: {
        method: "GET",
        url: `${apiBase}/api/events/traits`,
        params,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
