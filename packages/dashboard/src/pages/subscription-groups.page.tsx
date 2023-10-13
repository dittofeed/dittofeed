import { Delete } from "@mui/icons-material";
import { IconButton, ListItem, ListItemText } from "@mui/material";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import {
  DeleteSubscriptionGroupRequest,
  EmptyResponse,
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
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
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

    serverInitialState.subscriptionGroups = subscriptionGroup.map(
      subscriptionGroupToResource
    );
    return {
      props: addInitialStateToProps({
        serverInitialState,
        dfContext,
        props: {},
      }),
    };
  });

function Item({ item }: { item: SubscriptionGroupResource }) {
  const setSubscriptionGroupDeleteRequest = useAppStore(
    (store) => store.setSubscriptionGroupDeleteRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const subscriptionGroupDeleteRequest = useAppStore(
    (store) => store.subscriptionGroupDeleteRequest
  );

  const deleteSubscriptionGroup = useAppStore(
    (store) => store.deleteSubscriptionGroup
  );
  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteSubscriptionGroupRequest
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteSubscriptionGroup(deleteRequest.id);
  };

  const handleDelete = apiRequestHandlerFactory({
    request: subscriptionGroupDeleteRequest,
    setRequest: setSubscriptionGroupDeleteRequest,
    responseSchema: EmptyResponse,
    setResponse: setDeleteResponse,
    onSuccessNotice: `Deleted subscription group ${item.name}.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to delete subscription group ${item.name}.`,
    requestConfig: {
      method: "DELETE",
      url: `${apiBase}/api/subscription-groups`,
      data: {
        id: item.id,
      },
      headers: {
        "Content-Type": "application/json",
      },
    },
  });
  return (
    <ListItem
      secondaryAction={
        <IconButton edge="end" onClick={handleDelete}>
          <Delete />
        </IconButton>
      }
    >
      <ResourceListItemButton
        href={`/dashboard/subscription-groups/${item.id}`}
      >
        <ListItemText>{item.name}</ListItemText>
      </ResourceListItemButton>
    </ListItem>
  );
}

export default function SubscriptionGroups() {
  const subscriptionGroups = useAppStore((store) => store.subscriptionGroups);

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
