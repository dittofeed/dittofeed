import { toSegmentResource } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import {
  ChannelType,
  CompletionStatus,
  SubscriptionGroupType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

const getSubscriptionGroupsSSP: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const serverInitialState: Partial<AppState> = {};

    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }
    const workspaceId = dfContext.workspace.id;
    const subscriptionGroup = await prisma().subscriptionGroup.findUnique({
      where: {
        id,
      },
      include: {
        Segment: true,
      },
    });

    if (subscriptionGroup) {
      const resource = subscriptionGroupToResource(subscriptionGroup);

      serverInitialState.subscriptionGroups = [resource];
      serverInitialState.editedSubscriptionGroup = resource;

      const segment = subscriptionGroup.Segment[0];

      const segmentResource = segment
        ? toSegmentResource(segment).unwrapOr(null)
        : null;

      if (segmentResource) {
        serverInitialState.segments = {
          type: CompletionStatus.Successful,
          value: [segmentResource],
        };
      }
    } else {
      serverInitialState.editedSubscriptionGroup = {
        workspaceId,
        id,
        name: `Subscription Group - ${id}`,
        type: SubscriptionGroupType.OptOut,
        channel: ChannelType.Email,
      };
    }

    return {
      props: addInitialStateToProps({
        serverInitialState,
        props: {},
        dfContext,
      }),
    };
  });

export default getSubscriptionGroupsSSP;
