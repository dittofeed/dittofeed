import { db, insert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { toJourneyResource } from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { findSegmentResources } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { findAllUserPropertyResources } from "backend-lib/src/userProperties";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { CompletionStatus } from "isomorphic-lib/src/types";
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
    const [
      journey,
      segments,
      templateResources,
      subscriptionGroups,
      userProperties,
    ] = await Promise.all([
      await db().query.journey.findFirst({
        where: eq(schema.journey.id, id),
      }),
      findSegmentResources({ workspaceId }),
      findMessageTemplates({ workspaceId }),
      db().query.subscriptionGroup.findMany({
        where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
      }),
      findAllUserPropertyResources({ workspaceId }),
    ]);

    const serverInitialState: PreloadedState = {
      messages: {
        type: CompletionStatus.Successful,
        value: templateResources,
      },
      subscriptionGroups: subscriptionGroups.map(subscriptionGroupToResource),
    };

    const journeyResourceResult =
      journey?.workspaceId === workspaceId ? toJourneyResource(journey) : null;

    if (journeyResourceResult) {
      if (!journeyResourceResult.isOk()) {
        logger().error(
          {
            journey,
            err: journeyResourceResult.error,
          },
          "failed to parse journey resource",
        );
        throw journeyResourceResult.error;
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

      const newJourney = await insert({
        table: schema.journey,
        values: {
          id,
          workspaceId,
          draft: journeyStateToDraft(stateForDraft),
          name,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        doNothingOnConflict: true,
      }).then(unwrap);

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

    serverInitialState.segments = {
      type: CompletionStatus.Successful,
      value: segments,
    };

    serverInitialState.userProperties = {
      type: CompletionStatus.Successful,
      value: userProperties,
    };

    const props = addInitialStateToProps({
      serverInitialState,
      props: {},
      dfContext,
    });

    return {
      props,
    };
  });
