import { DownloadForOffline } from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import { Tooltip } from "@mui/material";
import { getPeriodsByComputedPropertyId } from "backend-lib/src/computedProperties/periods";
import { findManyJourneyResourcesUnsafe } from "backend-lib/src/journeys";
import { findManyPartialSegments } from "backend-lib/src/segments";
import { ComputedPropertyStep } from "backend-lib/src/types";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { pick } from "remeda";

import DashboardContent from "../../components/dashboardContent";
import { ResourceListContainer } from "../../components/resourceList";
import SegmentsTable from "../../components/segmentsTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { downloadFileFactory } from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;
    const [segmentResources, journeyResources] = await Promise.all([
      findManyPartialSegments({ workspaceId }),
      findManyJourneyResourcesUnsafe({
        where: { workspaceId, resourceType: "Declarative" },
      }),
    ]);
    const computedPropertyPeriods = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ProcessAssignments,
    });

    const segments: AppState["segments"] = {
      type: CompletionStatus.Successful,
      value: segmentResources.map((segment) => ({
        ...segment,
        lastRecomputed: computedPropertyPeriods
          .get({
            computedPropertyId: segment.id,
            version: segment.definitionUpdatedAt.toString(),
          })
          ?.maxTo.getTime(),
      })),
    };
    const journeys: AppState["journeys"] = {
      type: CompletionStatus.Successful,
      value: journeyResources,
    };
    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
        serverInitialState: {
          segments,
          journeys,
        },
      }),
    };
  });

export default function SegmentList() {
  const {
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
        variant="outlined"
        startIcon={<DownloadForOffline />}
        onClick={handleDownload}
      >
        Download User Segments
      </LoadingButton>
    </Tooltip>
  );
  return (
    <DashboardContent>
      <ResourceListContainer
        title="Segments"
        titleSingular="Segment"
        newItemHref={(newItemId) => `/segments/${newItemId}`}
        controls={controls}
      >
        <SegmentsTable />
      </ResourceListContainer>
    </DashboardContent>
  );
}
