import {
  CompletionStatus,
  GetPropertiesRequest,
  GetPropertiesResponse,
} from "isomorphic-lib/src/types";
import { useEffect } from "react";

import apiRequestHandlerFactory from "./apiRequestHandlerFactory";
import { useAppStorePick } from "./appStore";

export default function useLoadProperties() {
  const {
    apiBase,
    workspace,
    getPropertiesRequest,
    setGetPropertiesRequest,
    upsertProperties,
  } = useAppStorePick([
    "apiBase",
    "workspace",
    "getPropertiesRequest",
    "setGetPropertiesRequest",
    "upsertProperties",
  ]);

  useEffect(() => {
    if (workspace.type !== CompletionStatus.Successful) {
      return;
    }
    const workspaceId = workspace.value.id;
    const params: GetPropertiesRequest = {
      workspaceId,
    };
    apiRequestHandlerFactory({
      request: getPropertiesRequest,
      setRequest: setGetPropertiesRequest,
      responseSchema: GetPropertiesResponse,
      setResponse: ({ properties: p }) => upsertProperties(p),
      requestConfig: {
        method: "GET",
        url: `${apiBase}/api/events/properties`,
        params,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
