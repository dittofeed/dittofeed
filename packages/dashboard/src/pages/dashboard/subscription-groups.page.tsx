import { ListItem, ListItemText } from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import {
  CompletionStatus,
  SubscriptionGroupResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import DashboardContent from "../../components/dashboardContent";
import {
  ResourceList,
  ResourceListContainer,
  ResourceListItemButton,
} from "../../components/resourceList";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { PropsWithInitialState, useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { AppState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  // Dynamically import to avoid transitively importing backend config at build time.

  const workspaceId = backendConfig().defaultWorkspaceId;
  const appState: Partial<AppState> = {};
  const [workspace, subscriptionGroup] = await Promise.all([
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
    prisma().subscriptionGroup.findMany({
      where: {
        workspaceId,
      },
    }),
  ]);
  if (workspace) {
    appState.workspace = {
      type: CompletionStatus.Successful,
      value: workspace,
    };
  }

  appState.subscriptionGroups = {
    type: CompletionStatus.Successful,
    value: subscriptionGroup.map(subscriptionGroupToResource),
  };
  return {
    props: addInitialStateToProps({}, appState),
  };
};

function Item({ item }: { item: SubscriptionGroupResource }) {
  return (
    <ListItem>
      <ResourceListItemButton
        href={`/dashboard/subscription-groups/${item.id}`}
      >
        <ListItemText>{item.name}</ListItemText>
      </ResourceListItemButton>
    </ListItem>
  );
}

export default function SubscriptionGroups() {
  const subscriptionGroupsResult = useAppStore(
    (store) => store.subscriptionGroups
  );
  const subscriptionGroups =
    subscriptionGroupsResult.type === CompletionStatus.Successful
      ? subscriptionGroupsResult.value
      : [];

  return (
    <DashboardContent>
      <ResourceListContainer
        title="Subscription Groups"
        newItemHref={(newItemId) =>
          `/dashboard/subscription-groups/${newItemId}`
        }
      >
        {subscriptionGroups.length ? (
          <ResourceList>
            {subscriptionGroups.map((subscriptionGroup) => (
              <Item key={subscriptionGroup.id} item={subscriptionGroup} />
            ))}
          </ResourceList>
        ) : null}
      </ResourceListContainer>
    </DashboardContent>
  );
}
