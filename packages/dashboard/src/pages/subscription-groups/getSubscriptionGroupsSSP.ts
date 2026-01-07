import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { toSegmentResource } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { eq } from "drizzle-orm";
import {
  ChannelType,
  CompletionStatus,
  SubscriptionGroupType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
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
    let name: string;
    if (typeof ctx.query.name === "string") {
      name = ctx.query.name;
    } else {
      name = `Subscription Group - ${id}`;
    }
    const workspaceId = dfContext.workspace.id;
    const subscriptionGroup = await db().query.subscriptionGroup.findFirst({
      where: eq(schema.subscriptionGroup.id, id),
      with: {
        segments: true,
      },
    });

    if (subscriptionGroup) {
      const resource = subscriptionGroupToResource(subscriptionGroup);

      serverInitialState.subscriptionGroups = [resource];
      serverInitialState.editedSubscriptionGroup = resource;

      // Load all segments associated with this subscription group
      const segmentResources = subscriptionGroup.segments
        .map((segment) => toSegmentResource(segment).unwrapOr(null))
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (segmentResources.length > 0) {
        serverInitialState.segments = {
          type: CompletionStatus.Successful,
          value: segmentResources,
        };
      }
    } else {
      serverInitialState.editedSubscriptionGroup = {
        workspaceId,
        id,
        name,
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
