import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import {
  CompletionStatus,
  DeleteSegmentRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React from "react";
import { pick } from "remeda/dist/commonjs/pick";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore } from "../lib/appStore";
import { ResourceTable } from "./resourceTable";

interface Row {
  id: string;
  name: string;
  // FIXME
  journeys: { name: string; id: string }[];
  lastRecomputed: string;
  updatedAt: string;
}

export default function SegmentsTable() {
  const { segments: segmentsRequest, workspace: workspaceRequest } =
    useAppStore((store) =>
      pick(store, [
        "segments",
        "segmentDownloadRequest",
        "setSegmentDownloadRequest",
        "apiBase",
        "workspace",
      ]),
    );
  const segments =
    segmentsRequest.type === CompletionStatus.Successful
      ? segmentsRequest.value
      : [];
  const workspace =
    workspaceRequest.type === CompletionStatus.Successful
      ? workspaceRequest.value
      : null;

  const segmentsRow: Row[] = [];

  segments.forEach((segment) => {
    const row: Row = {
      id: segment.id,
      name: segment.name,
      updatedAt: segment.updatedAt
        ? new Date(segment.updatedAt).toISOString()
        : "Not Updated",
      journeys: segment.journeys ?? [],
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
              return;
            }
            return (
              <div
                style={{
                  padding: "0.5rem",
                }}
              >
                <FormControl
                  sx={{
                    width: 200,
                    height: 40,
                  }}
                  size="small"
                >
                  <InputLabel>
                    {currentRow.journeys.length}{" "}
                    {currentRow.journeys.length === 1 ? "Journey" : "Journeys"}
                  </InputLabel>
                  <Select
                    label="Journeys"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {currentRow.journeys.map((journey) => {
                      return (
                        <MenuItem key={journey.id}>
                          <Tooltip title={journey.name}>
                            <Link
                              href={`/journeys/${journey.id}`}
                              passHref
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              style={{
                                color: "black",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                textDecoration: "none",
                                width: 200,
                              }}
                            >
                              {journey.name}
                            </Link>
                          </Tooltip>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </div>
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
