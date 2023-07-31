import { Delete } from "@mui/icons-material";
import {
  IconButton,
  ListItem,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import {
  CompletionStatus,
  DeleteSegmentRequest,
  EmptyResponse,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { pick } from "remeda/dist/commonjs/pick";

import DashboardContent from "../../components/dashboardContent";
import {
  ResourceList,
  ResourceListContainer,
} from "../../components/resourceList";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
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
  const path = useRouter();
  const setSegmentDeleteRequest = useAppStore(
    (store) => store.setSegmentDeleteRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const segmentDeleteRequest = useAppStore(
    (store) => store.segmentDeleteRequest
  );
  const deleteSegment = useAppStore((store) => store.deleteSegment);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteSegmentRequest
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
        <IconButton edge="end" onClick={handleDelete}>
          <Delete />
        </IconButton>
      }
    >
      <ListItemButton
        sx={{
          border: 1,
          borderTopLeftRadius: 1,
          borderBottomLeftRadius: 1,
          borderColor: "grey.200",
        }}
        onClick={() => {
          // TODO use next/link
          path.push(`/segments/${segment.id}`);
        }}
      >
        <ListItemText primary={segment.name} />
      </ListItemButton>
    </ListItem>
  );
}

export default function SegmentList() {
  const { segments: segmentsRequest } = useAppStore((store) =>
    pick(store, ["segments"])
  );
  const segments =
    segmentsRequest.type === CompletionStatus.Successful
      ? segmentsRequest.value
      : [];

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
