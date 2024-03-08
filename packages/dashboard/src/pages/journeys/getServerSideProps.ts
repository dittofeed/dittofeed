import { getFeatures } from "backend-lib/src/features";
import { toJourneyResource } from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { toSegmentResource } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { CompletionStatus, FeatureNamesEnum } from "isomorphic-lib/src/types";
import { Result } from "neverthrow";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import {
  buildNodesIndex,
  DEFAULT_EDGES,
  DEFAULT_JOURNEY_NODES,
} from "../../components/journeys/defaults";
import {
  journeyDraftToState,
  JourneyResourceWithDefinitionForState,
  JourneyResourceWithDraftForState,
  JourneyStateForDraft,
  JourneyStateForResource,
  journeyStateToDraft,
  journeyToState,
} from "../../components/journeys/store";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../lib/types";

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

      let stateFromJourney: JourneyStateForResource;
      if (journeyResource.draft) {
        const resource: JourneyResourceWithDraftForState = {
          ...journeyResource,
          draft: journeyResource.draft,
        };
        stateFromJourney = journeyDraftToState(resource);
      } else if (journeyResource.definition) {
        const resource: JourneyResourceWithDefinitionForState = {
          ...journeyResource,
          definition: journeyResource.definition,
        };
        stateFromJourney = journeyToState(resource);
      } else {
        const err = new Error("journey resource has no definition or draft");
        logger().error({
          journeyResource,
          err,
        });
        throw err;
      }

      serverInitialState.journeyName = stateFromJourney.journeyName;
      serverInitialState.journeyEdges = stateFromJourney.journeyEdges;
      serverInitialState.journeyNodes = stateFromJourney.journeyNodes;
      serverInitialState.journeyNodesIndex = stateFromJourney.journeyNodesIndex;
    } else {
      const stateForDraft: JourneyStateForDraft = {
        journeyNodes: DEFAULT_JOURNEY_NODES,
        journeyEdges: DEFAULT_EDGES,
      };

      const name = `New Journey - ${id}`;

      const newJourney = await prisma().journey.upsert({
        where: { id },
        create: {
          id,
          workspaceId,
          draft: journeyStateToDraft(stateForDraft),
          name,
        },
        update: {},
      });
      serverInitialState.journeyName = name;
      serverInitialState.journeyEdges = DEFAULT_EDGES;
      serverInitialState.journeyNodes = DEFAULT_JOURNEY_NODES;
      serverInitialState.journeyNodesIndex = buildNodesIndex(
        DEFAULT_JOURNEY_NODES,
      );
      serverInitialState.journeys = {
        type: CompletionStatus.Successful,
        value: [unwrap(toJourneyResource(newJourney))],
      };
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
