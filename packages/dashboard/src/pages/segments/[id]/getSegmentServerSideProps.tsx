import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { findAllUserTraits } from "backend-lib/src/userEvents";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

const entryId = "entry";
const initTraitId = "initTraitId";

const getSegmentServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const serverInitialState: PreloadedState = {};

    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const workspaceId = dfContext.workspace.id;
    const [segment, traits, subscriptionGroups, messageTemplates] =
      await Promise.all([
        prisma().segment.findUnique({
          where: {
            id,
          },
        }),
        findAllUserTraits({
          workspaceId,
        }),
        prisma().subscriptionGroup.findMany({
          where: {
            workspaceId,
          },
        }),
        findMessageTemplates({
          workspaceId,
        }),
      ]);

    serverInitialState.messages = {
      type: CompletionStatus.Successful,
      value: messageTemplates,
    };

    let segmentResource: SegmentResource;
    if (segment) {
      const segmentDefinition = unwrap(
        schemaValidate(segment.definition, SegmentDefinition)
      );
      segmentResource = {
        id: segment.id,
        name: segment.name,
        workspaceId,
        definition: segmentDefinition,
      };

      serverInitialState.segments = {
        type: CompletionStatus.Successful,
        value: [segmentResource],
      };
    } else {
      segmentResource = {
        name: `My Segment - ${id}`,
        id,
        workspaceId,
        definition: {
          entryNode: {
            type: SegmentNodeType.And,
            children: [initTraitId],
            id: entryId,
          },
          nodes: [
            {
              type: SegmentNodeType.Trait,
              id: initTraitId,
              path: "",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "",
              },
            },
          ],
        },
      };
    }
    serverInitialState.editedSegment = segmentResource;

    serverInitialState.subscriptionGroups = {
      type: CompletionStatus.Successful,
      value: subscriptionGroups.map(subscriptionGroupToResource),
    };

    serverInitialState.traits = {
      type: CompletionStatus.Successful,
      value: traits,
    };

    return {
      props: addInitialStateToProps({
        serverInitialState,
        props: {},
        dfContext,
      }),
    };
  });

export default getSegmentServerSideProps;
