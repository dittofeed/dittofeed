import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { eq } from "drizzle-orm";
import {
  DeleteSubscriptionGroupRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import { ResourceListContainer } from "../components/resourceList";
import { ResourceTable } from "../components/resourceTable";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import { requestContext } from "../lib/requestContext";
import { AppState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    // Dynamically import to avoid transitively importing backend config at build time.

    const workspaceId = dfContext.workspace.id;
    const serverInitialState: Partial<AppState> = {};
    const subscriptionGroup = await db().query.subscriptionGroup.findMany({
      where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
    });

    serverInitialState.subscriptionGroups = subscriptionGroup.map(
      subscriptionGroupToResource,
    );
    return {
      props: addInitialStateToProps({
        serverInitialState,
        dfContext,
        props: {},
      }),
    };
  });

export default function SubscriptionGroups() {
  const {
    subscriptionGroups,
    subscriptionGroupDeleteRequest,
    setSubscriptionGroupDeleteRequest,
    deleteSubscriptionGroup,
    apiBase,
  } = useAppStorePick([
    "subscriptionGroups",
    "subscriptionGroupDeleteRequest",
    "setSubscriptionGroupDeleteRequest",
    "deleteSubscriptionGroup",
    "apiBase",
  ]);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteSubscriptionGroupRequest,
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteSubscriptionGroup(deleteRequest.id);
  };

  const rows = subscriptionGroups.map((subscriptionGroup) => ({
    id: subscriptionGroup.id,
    name: subscriptionGroup.name,
    updatedAt: new Date(subscriptionGroup.updatedAt).toISOString(),
  }));

  return (
    <DashboardContent>
      <ResourceListContainer
        title="Subscription Groups"
        titleSingular="Subscription Group"
        newItemHref={(newItemId) => `/subscription-groups/${newItemId}`}
      >
        <ResourceTable
          rows={rows}
          getHref={(id) => `/subscription-groups/${id}`}
          onDelete={({ row }) => {
            const handleDelete = apiRequestHandlerFactory({
              request: subscriptionGroupDeleteRequest,
              setRequest: setSubscriptionGroupDeleteRequest,
              responseSchema: EmptyResponse,
              setResponse: setDeleteResponse,
              onSuccessNotice: `Deleted subscription group ${row.name}.`,
              onFailureNoticeHandler: () =>
                `API Error: Failed to delete subscription group ${row.name}.`,
              requestConfig: {
                method: "DELETE",
                url: `${apiBase}/api/subscription-groups`,
                data: {
                  id: row.id,
                },
                headers: {
                  "Content-Type": "application/json",
                },
              },
            });
            handleDelete();
          }}
        />
      </ResourceListContainer>
    </DashboardContent>
  );
}
