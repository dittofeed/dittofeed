import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { SubscriptionGroupType } from "isomorphic-lib/src/types";
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
    });

    if (subscriptionGroup) {
      serverInitialState.editedSubscriptionGroup =
        subscriptionGroupToResource(subscriptionGroup);
    } else {
      serverInitialState.editedSubscriptionGroup = {
        workspaceId,
        id,
        name: `Subscription Group - ${id}`,
        type: SubscriptionGroupType.OptIn,
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
