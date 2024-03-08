import { getFeatures } from "backend-lib/src/features";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { toSegmentResource } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { CompletionStatus, FeatureNamesEnum } from "isomorphic-lib/src/types";
import { Result } from "neverthrow";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import {
  buildNodesIndex,
  defaultEdges,
  defaultNodes,
} from "../../components/journeys/defaults";
import {
  JourneyResourceWithDefinitionForState,
  JourneyResourceWithDraftForState,
  JourneyStateForResource,
  journeyDraftToState,
  journeyToState,
} from "../../components/journeys/store";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../lib/types";
import logger from "backend-lib/src/logger";

export type JourneyGetServerSideProps =
  GetServerSideProps<PropsWithInitialState>;

export const journeyGetServerSideProps: JourneyGetServerSideProps =
  requestContext(async (ctx, dfContext) => {
    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const workspaceId = dfContext.workspace.id;
    const [journey, segments, templateResources, subscriptionGroups, features] =
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
        getFeatures({
          workspaceId,
          names: [FeatureNamesEnum.DisplayJourneyPercentages],
        }),
      ]);

    const serverInitialState: PreloadedState = {
      messages: {
        type: CompletionStatus.Successful,
        value: templateResources,
      },
      subscriptionGroups: subscriptionGroups.map(subscriptionGroupToResource),
      features,
    };

    const journeyResourceResult =
      journey?.workspaceId === workspaceId ? toJourneyResource(journey) : null;

    if (journeyResourceResult) {
      if (!journeyResourceResult.isOk()) {
        const err = new Error("failed to parse journey resource");

        logger().error({
          journey,
          err,
        });
        throw err;
      }

      const journeyResource = journeyResourceResult.value;
      serverInitialState.journeys = {
        type: CompletionStatus.Successful,
        value: [journeyResource],
      };
      // FIXME cleanup
      let stateFromJourney: JourneyStateForResource;
      if (journeyResource.draft) {
        const resource: JourneyResourceWithDraftForState = {
          ...journeyResource,
          draft: journeyResource.draft,
        };
        stateFromJourney = journeyDraftToState(resource);
      } else if (journeyResource.definition !== undefined) {
        const resource: JourneyResourceWithDefinitionForState = {
          ...journeyResource,
          definition: journeyResource.definition,
        };
        stateFromJourney = journeyToState(resource);
      } else {
        // FIXME cleanup dedup
        stateFromJourney = {
          journeyName: `New Journey - ${id}`,
          journeyNodes: defaultNodes,
          journeyEdges: defaultEdges,
          journeyNodesIndex: buildNodesIndex(defaultNodes),
        };
      }

      Object.assign(serverInitialState, stateFromJourney);
    } else {
      serverInitialState.journeyName = `New Journey - ${id}`;
      serverInitialState.journeyNodes = defaultNodes;
      serverInitialState.journeyEdges = defaultEdges;
      serverInitialState.journeyNodesIndex = buildNodesIndex(defaultNodes);
    }

    const segmentResourceResult = Result.combine(
      segments.map(toSegmentResource),
    );

    if (segmentResourceResult.isOk()) {
      const segmentResource = segmentResourceResult.value;
      serverInitialState.segments = {
        type: CompletionStatus.Successful,
        value: segmentResource,
      };
    }
    logger().debug(serverInitialState, "journey loc3");

    const props = addInitialStateToProps({
      serverInitialState,
      props: {},
      dfContext,
    });

    return {
      props,
    };
  });
