import { ListItem, ListItemText } from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import {
  CompletionStatus,
  SubscriptionGroupResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import {
  ResourceList,
  ResourceListContainer,
  ResourceListItemButton,
} from "../components/resourceList";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { useAppStore } from "../lib/appStore";
import prisma from "../lib/prisma";
import { requestContext } from "../lib/requestContext";
import { AppState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    // Dynamically import to avoid transitively importing backend config at build time.

    const workspaceId = dfContext.workspace.id;
    const serverInitialState: Partial<AppState> = {};
    const subscriptionGroup = await prisma().subscriptionGroup.findMany({
      where: {
        workspaceId,
      },
    });

    serverInitialState.subscriptionGroups = {
      type: CompletionStatus.Successful,
      value: subscriptionGroup.map(subscriptionGroupToResource),
    };
    return {
      props: addInitialStateToProps({
        serverInitialState,
        dfContext,
        props: {},
      }),
    };
  });

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
        newItemHref={(newItemId) => `/subscription-groups/${newItemId}`}
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
