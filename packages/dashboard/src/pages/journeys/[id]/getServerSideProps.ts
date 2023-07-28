import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { Result } from "neverthrow";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import {
  buildNodesIndex,
  defaultEdges,
  defaultNodes,
} from "../../../components/journeys/defaults";
import {
  journeyToState,
  journeyToStateV2,
} from "../../../components/journeys/store";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

export type JourneyGetServerSideProps =
  GetServerSideProps<PropsWithInitialState>;

export const journeyGetServerSideProps: JourneyGetServerSideProps =
  requestContext(async (ctx, dfContext) => {
    // Dynamically import to avoid transitively importing backend config at build time.
    const [{ toJourneyResource }, { toSegmentResource }] = await Promise.all([
      import("backend-lib/src/journeys"),
      import("backend-lib/src/segments"),
    ]);

    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const workspaceId = dfContext.workspace.id;
    const [journey, segments, templateResources, subscriptionGroups] =
      await Promise.all([
        await prisma().journey.findUnique({
          where: { id },
        }),
        prisma().segment.findMany({
          where: {
            workspaceId,
            resourceType: {
              not: "Internal",
            },
          },
        }),
        findMessageTemplates({ workspaceId }),
        prisma().subscriptionGroup.findMany({
          where: { workspaceId },
        }),
      ]);

    const serverInitialState: PreloadedState = {
      messages: {
        type: CompletionStatus.Successful,
        value: templateResources,
      },
      subscriptionGroups: {
        type: CompletionStatus.Successful,
        value: subscriptionGroups.map(subscriptionGroupToResource),
      },
    };

    const journeyResourceResult = journey && toJourneyResource(journey);
    if (journeyResourceResult?.isOk()) {
      const journeyResource = journeyResourceResult.value;
      serverInitialState.journeys = {
        type: CompletionStatus.Successful,
        value: [journeyResource],
      };
      const stateFromJourney = journeyToStateV2(journeyResource);
      Object.assign(serverInitialState, stateFromJourney);
    } else {
      serverInitialState.journeyName = `New Journey - ${id}`;
      serverInitialState.journeyNodes = defaultNodes;
      serverInitialState.journeyEdges = defaultEdges;
      serverInitialState.journeyNodesIndex = buildNodesIndex(defaultNodes);
    }

    const segmentResourceResult = Result.combine(
      segments.map(toSegmentResource)
    );

    if (segmentResourceResult.isOk()) {
      const segmentResource = segmentResourceResult.value;
      serverInitialState.segments = {
        type: CompletionStatus.Successful,
        value: segmentResource,
      };
    }

    const props = addInitialStateToProps({
      serverInitialState,
      props: {},
      dfContext,
    });

    return {
      props,
    };
  });
