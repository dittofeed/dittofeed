import backendConfig from "backend-lib/src/config";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import {
  CompletionStatus,
  SubscriptionGroupType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { PropsWithInitialState } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { AppState } from "../../lib/types";

const getSubscriptionGroupsSSP: GetServerSideProps<
  PropsWithInitialState
> = async (ctx) => {
  const workspaceId = backendConfig().defaultWorkspaceId;
  const appState: Partial<AppState> = {};

  const id = ctx.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }

  const [workspace, subscriptionGroup] = await Promise.all([
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
    prisma().subscriptionGroup.findUnique({
      where: {
        id,
      },
    }),
  ]);

  if (subscriptionGroup) {
    appState.editedSubscriptionGroup =
      subscriptionGroupToResource(subscriptionGroup);
  } else {
    appState.editedSubscriptionGroup = {
      workspaceId,
      id,
      name: `Subscription Group - ${id}`,
      type: SubscriptionGroupType.OptIn,
    };
  }

  if (workspace) {
    appState.workspace = {
      type: CompletionStatus.Successful,
      value: workspace,
    };
  }
  return {
    props: addInitialStateToProps({}, appState),
  };
};

export default getSubscriptionGroupsSSP;
