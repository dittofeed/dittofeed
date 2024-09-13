import {
  CompletionStatus,
  DeleteJourneyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import { BaseResourceRow, ResourceTable } from "./resourceTable";

export default function JourneysTable() {
  const {
    workspace,
    apiBase,
    deleteJourney,
    journeyDeleteRequest,
    setJourneyDeleteRequest,
    journeys: journeysResult,
  } = useAppStorePick([
    "workspace",
    "apiBase",
    "deleteJourney",
    "journeyDeleteRequest",
    "setJourneyDeleteRequest",
    "journeys",
  ]);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteJourneyRequest,
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteJourney(deleteRequest.id);
  };

  const journeys =
    journeysResult.type === CompletionStatus.Successful
      ? journeysResult.value
      : [];

  const journeysRow: BaseResourceRow[] = [];

  journeys.forEach((journey) => {
    const row = {
      id: journey.id,
      name: journey.name,
      updatedAt: new Date(journey.updatedAt).toISOString(),
    };
    journeysRow.push(row);
  });
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  if (!workspaceId) {
    return null;
  }

  return (
    <ResourceTable
      rows={journeysRow}
      getHref={(id) => `/journeys/${id}`}
      onDelete={({ row }) => {
        const currentRow = row;
        const handleDelete = apiRequestHandlerFactory({
          request: journeyDeleteRequest,
          setRequest: setJourneyDeleteRequest,
          responseSchema: EmptyResponse,
          onSuccessNotice: `Deleted journey ${currentRow.name}.`,
          onFailureNoticeHandler: () =>
            `API Error: Failed to delete journey ${currentRow.name}.`,
          setResponse: setDeleteResponse,
          requestConfig: {
            method: "DELETE",
            url: `${apiBase}/api/journeys`,
            data: {
              workspaceId,
              id: currentRow.id,
            } satisfies DeleteJourneyRequest,
            headers: {
              "Content-Type": "application/json",
            },
          },
        });
        handleDelete();
      }}
    />
  );
}
