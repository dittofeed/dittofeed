import { ListItem, ListItemText } from "@mui/material";
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
  // const setSubscriptionGroupDeleteRequest = useAppStore(
  //   (store) => store.setSubscriptionGroupDeleteRequest
  // );
  // const apiBase = useAppStore((store) => store.apiBase);
  // const segmentDeleteRequest = useAppStore(
  //   (store) => store.segmentDeleteRequest
  // );

  // const deleteSubscriptionGroup = useAppStore((store) => store.deleteSubscriptionGroup);
  // const setDeleteResponse = (
  //   _response: DeleteSubscriptionGroupResponse,
  //   deleteRequest?: DeleteSubscriptionGroupRequest
  // ) => {
  //   if (!deleteRequest) {
  //     return;
  //   }
  //   deleteSubscriptionGroup(deleteRequest.id);
  // };

  // const handleDelete = apiRequestHandlerFactory({
  //   request: segmentDeleteRequest,
  //   setRequest: setSubscriptionGroupDeleteRequest,
  //   responseSchema: DeleteSubscriptionGroupResponse,
  //   setResponse: setDeleteResponse,
  //   onSuccessNotice: `Deleted segment ${segment.name}.`,
  //   onFailureNoticeHandler: () =>
  //     `API Error: Failed to delete segment ${segment.name}.`,
  //   requestConfig: {
  //     method: "DELETE",
  //     url: `${apiBase}/api/segments`,
  //     data: {
  //       id: segment.id,
  //     },
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //   },
  // });
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
