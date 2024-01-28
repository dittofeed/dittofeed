import { DownloadForOffline } from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import { ListItem, ListItemText, Tooltip } from "@mui/material";
import {
  CompletionStatus,
  DeleteSegmentRequest,
  EmptyResponse,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { pick } from "remeda/dist/commonjs/pick";

import DeleteDialog from "../../components/confirmDeleteDialog";
import DashboardContent from "../../components/dashboardContent";
import {
  ResourceList,
  ResourceListContainer,
  ResourceListItemButton,
} from "../../components/resourceList";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory, {
  downloadFileFactory,
} from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    // Dynamically import to avoid transitively importing backend config at build time.
    const { toSegmentResource } = await import("backend-lib/src/segments");

    const workspaceId = dfContext.workspace.id;
    const segmentResources: SegmentResource[] = (
      await prisma().segment.findMany({
        where: {
          workspaceId,
          resourceType: {
            not: "Internal",
          },
        },
      })
    ).flatMap((segment) => {
      const result = toSegmentResource(segment);
      if (result.isErr()) {
        return [];
      }
      return result.value;
    });
    const segments: AppState["segments"] = {
      type: CompletionStatus.Successful,
      value: segmentResources,
    };
    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
        serverInitialState: {
          segments,
        },
      }),
    };
  });

function SegmentItem({ segment }: { segment: SegmentResource }) {
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

  const handleDelete = apiRequestHandlerFactory({
    request: segmentDeleteRequest,
    setRequest: setSegmentDeleteRequest,
    responseSchema: EmptyResponse,
    setResponse: setDeleteResponse,
    onSuccessNotice: `Deleted segment ${segment.name}.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to delete segment ${segment.name}.`,
    requestConfig: {
      method: "DELETE",
      url: `${apiBase}/api/segments`,
      data: {
        id: segment.id,
      },
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  return (
    <ListItem
      secondaryAction={
        <DeleteDialog
          onConfirm={handleDelete}
          title="Confirm Deletion"
          message="Are you sure you want to delete this segment?"
        />
      }
    >
      <ResourceListItemButton href={`/dashboard/segments/${segment.id}`}>
        <ListItemText>{segment.name}</ListItemText>
      </ResourceListItemButton>
    </ListItem>
  );
}

export default function SegmentList() {
  const {
    segments: segmentsRequest,
    segmentDownloadRequest,
    setSegmentDownloadRequest,
    workspace: workspaceRequest,
    apiBase,
  } = useAppStore((store) =>
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

  if (!workspace) {
    console.error("No workspace found");
    return null;
  }

  const handleDownload = downloadFileFactory({
    request: segmentDownloadRequest,
    setRequest: setSegmentDownloadRequest,
    onSuccessNotice: `Downloaded user segment assignments.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to download user segment assignments.`,
    requestConfig: {
      method: "GET",
      url: `${apiBase}/api/segments/download`,
      params: {
        workspaceId: workspace.id,
      },
    },
  });

  const controls = (
    <Tooltip title="download user segments" placement="right" arrow>
      <LoadingButton
        loading={segmentDownloadRequest.type === CompletionStatus.InProgress}
        startIcon={<DownloadForOffline />}
        onClick={handleDownload}
      />
    </Tooltip>
  );
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <DashboardContent>
          <ResourceListContainer
            title="Segments"
            newItemHref={(newItemId) => `/segments/${newItemId}`}
            controls={controls}
          >
            {segments.length ? (
              <ResourceList>
                {segments.map((segment) => (
                  <SegmentItem key={segment.id} segment={segment} />
                ))}
              </ResourceList>
            ) : null}
          </ResourceListContainer>
        </DashboardContent>
      </main>
    </>
  );
}
