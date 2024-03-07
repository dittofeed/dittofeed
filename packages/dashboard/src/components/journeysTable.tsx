import {
  CompletionStatus,
  DeleteJourneyRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { BaseResourceRow, ResourceTable } from "./resourceTable";

export default function JourneysTable() {
  const setJourneyDeleteRequest = useAppStore(
    (store) => store.setJourneyDeleteRequest,
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const journeyDeleteRequest = useAppStore(
    (store) => store.journeyDeleteRequest,
  );
  const deleteJourney = useAppStore((store) => store.deleteJourney);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteJourneyRequest,
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteJourney(deleteRequest.id);
  };

  const journeysResult = useAppStore((store) => store.journeys);
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
              id: currentRow.id,
            },
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
