import { Stack, Typography } from "@mui/material";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useMemo } from "react";

import UsersTableV2, {
  usersTablePaginationHandler,
  UsersTableParams,
} from "../../../components/usersTableV2";
import { PropsWithInitialState } from "../../../lib/types";
import { useSubscriptionGroupsQuery } from "../../../lib/useSubscriptionGroupsQuery";
import getSubscriptionGroupsSSP from "../getSubscriptionGroupsSSP";
import SubscriptionGroupLayout, {
  SubscriptionGroupTabLabel,
} from "../subscriptionGroupLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  getSubscriptionGroupsSSP;

export default function SubscriptionGroupUsers() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : undefined;

  const { data: subscriptionGroups } = useSubscriptionGroupsQuery();

  const subscriptionGroup = useMemo(
    () => subscriptionGroups?.find((sg) => sg.id === id),
    [subscriptionGroups, id],
  );

  const queryParams = useMemo(
    () => schemaValidate(router.query, UsersTableParams).unwrapOr({}),
    [router.query],
  );

  if (!id) {
    return new Error("Missing id");
  }

  const onUsersTablePaginate = usersTablePaginationHandler(router);

  // Show loading state while fetching subscription group
  if (!subscriptionGroup) {
    return (
      <SubscriptionGroupLayout tab={SubscriptionGroupTabLabel.Users} id={id}>
        <Stack
          direction="column"
          sx={{
            width: "100%",
            height: "100%",
            padding: 2,
            alignItems: "start",
          }}
          spacing={3}
        >
          <Typography variant="body1">Loading...</Typography>
        </Stack>
      </SubscriptionGroupLayout>
    );
  }

  return (
    <SubscriptionGroupLayout tab={SubscriptionGroupTabLabel.Users} id={id}>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
        <Typography variant="h4">
          Users in &quot;{subscriptionGroup.name}&quot;
        </Typography>
        <UsersTableV2
          subscriptionGroupFilter={[id]}
          subscriptionGroupAction={{
            subscriptionGroupId: id,
            type: "unsubscribe",
          }}
          {...queryParams}
          onPaginationChange={onUsersTablePaginate}
        />
      </Stack>
    </SubscriptionGroupLayout>
  );
}
