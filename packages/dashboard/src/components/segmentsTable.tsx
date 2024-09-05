import { getSubscribedSegments } from "isomorphic-lib/src/journeys";
import {
  CompletionStatus,
  DeleteSegmentRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";
import { pick } from "remeda";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore, useAppStorePick } from "../lib/appStore";
import { getJourneysUsedBy, MinimalJourneyMap } from "../lib/journeys";
import {
  BaseResourceRow,
  RelatedResourceSelect,
  ResourceTable,
} from "./resourceTable";

interface Row extends BaseResourceRow {
  journeys: { name: string; id: string }[];
  lastRecomputed: string;
}

export default function SegmentsTable() {
  const {
    segments: segmentsRequest,
    workspace: workspaceRequest,
    journeys: journeysResult,
  } = useAppStorePick(["segments", "workspace", "journeys"]);

  const segments =
    segmentsRequest.type === CompletionStatus.Successful
      ? segmentsRequest.value
      : [];
  const workspace =
    workspaceRequest.type === CompletionStatus.Successful
      ? workspaceRequest.value
      : null;

  const segmentsRow: Row[] = [];

  const journeysUsedBy: MinimalJourneyMap = useMemo(() => {
    if (journeysResult.type !== CompletionStatus.Successful) {
      return new Map();
    }

    return journeysResult.value.reduce((acc, journey) => {
      if (!journey.definition) {
        return acc;
      }
      const journeyMap = new Map();
      journeyMap.set(journey.id, journey.name);

      const subscribed = getSubscribedSegments(journey.definition);
      subscribed.forEach((segmentId) => {
        acc.set(segmentId, journeyMap);
      });
      return acc;
    }, new Map());
  }, [journeysResult]);

  segments.forEach((segment) => {
    const row: Row = {
      id: segment.id,
      name: segment.name,
      updatedAt: segment.updatedAt
        ? new Date(segment.updatedAt).toISOString()
        : "Not Updated",
      journeys: getJourneysUsedBy(journeysUsedBy, segment.id),
      lastRecomputed: segment.lastRecomputed
        ? new Date(segment.lastRecomputed).toISOString()
        : "Not Re-Computed ",
    };
    segmentsRow.push(row);
  });

  const {
    setSegmentDeleteRequest,
    apiBase,
    segmentDeleteRequest,
    deleteSegment,
  } = useAppStore((store) =>
    pick(store, [
      "setSegmentDeleteRequest",
      "apiBase",
      "segmentDeleteRequest",
      "deleteSegment",
    ]),
  );

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteSegmentRequest,
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteSegment(deleteRequest.id);
  };

  if (!workspace) {
    console.error("No workspace found");
    return null;
  }

  return (
    <ResourceTable<Row>
      rows={segmentsRow}
      additionalColumns={[
        {
          field: "journeys",
          headerName: "Journeys Used By",
          // eslint-disable-next-line react/no-unused-prop-types
          renderCell: ({ row }: { row: Row }) => {
            const currentRow = row;
            if (currentRow.journeys.length === 0) {
              return null;
            }
            const relatedLabel = `${currentRow.journeys.length} ${currentRow.journeys.length === 1 ? "Journey" : "Journeys"}`;
            const relatedResources = currentRow.journeys.map((journey) => ({
              href: `/journeys/${journey.id}`,
              name: journey.name,
            }));
            return (
              <RelatedResourceSelect
                label={relatedLabel}
                relatedResources={relatedResources}
              />
            );
          },
        },
        {
          field: "lastRecomputed",
          headerName: "Last Recomputed",
        },
      ]}
      getHref={(id) => `/segments/${id}`}
      onDelete={({ row }) => {
        const currentRow = row;
        const handleDelete = apiRequestHandlerFactory({
          request: segmentDeleteRequest,
          setRequest: setSegmentDeleteRequest,
          responseSchema: EmptyResponse,
          setResponse: setDeleteResponse,
          onSuccessNotice: `Deleted segment ${currentRow.name}.`,
          onFailureNoticeHandler: () =>
            `API Error: Failed to delete segment ${currentRow.name}.`,
          requestConfig: {
            method: "DELETE",
            url: `${apiBase}/api/segments`,
            data: {
              workspaceId: workspace.id,
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
