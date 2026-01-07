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

export default function SubscriptionGroupUsersUnsubscribed() {
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

  // Create a name override for the internal unsubscribed segment
  // Must be before early returns to follow React hooks rules
  const segmentNameOverride = useMemo(() => {
    if (!subscriptionGroup?.unsubscribedSegmentId) return undefined;
    return {
      [subscriptionGroup.unsubscribedSegmentId]: `Unsubscribed from ${subscriptionGroup.name}`,
    };
  }, [subscriptionGroup]);

  const onUsersTablePaginate = usersTablePaginationHandler(router);

  if (!id) {
    return new Error("Missing id");
  }

  // Show loading state while fetching subscription group
  if (!subscriptionGroup) {
    return (
      <SubscriptionGroupLayout
        tab={SubscriptionGroupTabLabel.UsersUnsubscribed}
        id={id}
      >
        <Stack
          direction="column"
          sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
          spacing={3}
        >
          <Typography variant="body1">Loading...</Typography>
        </Stack>
      </SubscriptionGroupLayout>
    );
  }

  // Show message if unsubscribed segment ID is not available
  if (!subscriptionGroup.unsubscribedSegmentId) {
    return (
      <SubscriptionGroupLayout
        tab={SubscriptionGroupTabLabel.UsersUnsubscribed}
        id={id}
      >
        <Stack
          direction="column"
          sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
          spacing={3}
        >
          <Typography variant="body1">
            Unsubscribed segment not found for this subscription group.
          </Typography>
        </Stack>
      </SubscriptionGroupLayout>
    );
  }

  return (
    <SubscriptionGroupLayout
      tab={SubscriptionGroupTabLabel.UsersUnsubscribed}
      id={id}
    >
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
        <Typography variant="h4">
          Users Who Unsubscribed from &quot;{subscriptionGroup.name}&quot;
        </Typography>
        <UsersTableV2
          segmentFilter={[subscriptionGroup.unsubscribedSegmentId]}
          segmentNameOverride={segmentNameOverride}
          {...queryParams}
          onPaginationChange={onUsersTablePaginate}
        />
      </Stack>
    </SubscriptionGroupLayout>
  );
}
