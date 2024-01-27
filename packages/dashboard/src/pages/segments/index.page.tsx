import { DownloadForOffline } from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import { Tooltip } from "@mui/material";
import { Journey } from "@prisma/client";
import {
  ComputedPropertyStep,
  getPeriodsByComputedPropertyId,
} from "backend-lib/src/computedProperties/computePropertiesIncremental";
import {
  CompletionStatus,
  JourneyDefinition,
  JourneyNodeType,
  SegmentResource,
} from "isomorphic-lib/src/types";
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
    const segmentResources: (SegmentResource & {
      definitionUpdatedAt: number;
    })[] = (
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
    const journeys = await prisma().journey.findMany({
      where: {
        workspaceId,
      },
    });
    const computedPropertyPeriods = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ProcessAssignments,
    });

    const csps: Record<string, string> = {};
    for (const segmentResource of segmentResources) {
      const computedPropertyPeriod = computedPropertyPeriods.get({
        computedPropertyId: segmentResource.id,
        version: segmentResource.updatedAt.toString(),
      });
      if (computedPropertyPeriod !== undefined) {
        csps[segmentResource.id] = computedPropertyPeriod.version;
      }
    }

    const usedBy: Record<string, Journey[]> = {};
    for (const segmentResource of segmentResources) {
      for (const journey of journeys) {
        const journeyDefinition = journey.definition as JourneyDefinition;
        if (journeyDefinition.entryNode.segment === segmentResource.id) {
          usedBy[segmentResource.id] = usedBy[segmentResource.id] ?? [];
          if (!usedBy[segmentResource.id]?.includes(journey))
            usedBy[segmentResource.id]?.push(journey);
        } else {
          for (const node of journeyDefinition.nodes) {
            if (node.type === JourneyNodeType.WaitForNode) {
              for (const segmentChild of node.segmentChildren) {
                if (segmentChild.segmentId === segmentResource.id) {
                  usedBy[segmentResource.id] = usedBy[segmentResource.id] ?? [];
                  if (!usedBy[segmentResource.id]?.includes(journey))
                    usedBy[segmentResource.id]?.push(journey);
                }
              }
            }
          }
        }
      }
    }

    const segments: AppState["segments"] = {
      type: CompletionStatus.Successful,
      value: segmentResources.map((segment) => ({
        ...segment,
        lastRecomputed: Number(new Date(Number(csps[segment.id]))),
        journeys:
          usedBy[segment.id] && usedBy[segment.id]?.length !== 0
            ? usedBy[segment.id]
                ?.map((journey) => `${journey.name}`)
                ?.join(`, \n`)
            : "No Journey",
      })),
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
