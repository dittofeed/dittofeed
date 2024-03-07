import { DownloadForOffline } from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import { Tooltip } from "@mui/material";
import {
  ComputedPropertyStep,
  getPeriodsByComputedPropertyId,
} from "backend-lib/src/computedProperties/computePropertiesIncremental";
import { findManyJourneyResourcesUnsafe } from "backend-lib/src/journeys";
import { CompletionStatus, SegmentResource } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { pick } from "remeda/dist/commonjs/pick";

import DashboardContent from "../../components/dashboardContent";
import { ResourceListContainer } from "../../components/resourceList";
import SegmentsTable from "../../components/segmentsTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { downloadFileFactory } from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    // Dynamically import to avoid transitively importing backend config at build time.
    const { toSegmentResource } = await import("backend-lib/src/segments");

    const workspaceId = dfContext.workspace.id;
    const [segmentsFromDB, journeyResources] = await Promise.all([
      prisma().segment.findMany({
        where: {
          workspaceId,
          resourceType: {
            not: "Internal",
          },
        },
      }),
      findManyJourneyResourcesUnsafe({
        where: { workspaceId, resourceType: "Declarative" },
      }),
    ]);
    const segmentResources: (SegmentResource & {
      definitionUpdatedAt: number;
    })[] = segmentsFromDB.flatMap((segment) => {
      const result = toSegmentResource(segment);
      if (result.isErr()) {
        return [];
      }
      return result.value;
    });
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
            <SegmentsTable />
          </ResourceListContainer>
        </DashboardContent>
      </main>
    </>
  );
}
