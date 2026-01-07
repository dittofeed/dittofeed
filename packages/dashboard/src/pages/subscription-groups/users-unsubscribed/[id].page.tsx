import { Stack, Typography } from "@mui/material";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useMemo } from "react";

import UsersTableV2, {
  usersTablePaginationHandler,
  UsersTableParams,
} from "../../../components/usersTableV2";
import { useAppStore } from "../../../lib/appStore";
import { PropsWithInitialState } from "../../../lib/types";
import getSubscriptionGroupsSSP from "../getSubscriptionGroupsSSP";
import SubscriptionGroupLayout, {
  SubscriptionGroupTabLabel,
} from "../subscriptionGroupLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  getSubscriptionGroupsSSP;

export default function SubscriptionGroupUsersUnsubscribed() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : undefined;

  const segmentsResult = useAppStore((store) => store.segments);
  const editedSubscriptionGroup = useAppStore(
    (store) => store.editedSubscriptionGroup,
  );

  const queryParams = useMemo(
    () => schemaValidate(router.query, UsersTableParams).unwrapOr({}),
    [router.query],
  );

  // Find the unsubscribed segment for this subscription group
  const unsubscribedSegment = useMemo(
    () =>
      segmentsResult.type === CompletionStatus.Successful
        ? segmentsResult.value.find(
            (s) =>
              s.subscriptionGroupId === id &&
              s.name.includes("unsubscribed"),
          )
        : undefined,
    [segmentsResult, id],
  );

  if (!id) {
    return new Error("Missing id");
  }

  const onUsersTablePaginate = usersTablePaginationHandler(router);

  if (!editedSubscriptionGroup) {
    console.error("missing editedSubscriptionGroup");
    return null;
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
        {unsubscribedSegment ? (
          <>
            <Typography variant="h4">
              Users Who Unsubscribed from &quot;{editedSubscriptionGroup.name}
              &quot;
            </Typography>
            <UsersTableV2
              segmentFilter={[unsubscribedSegment.id]}
              {...queryParams}
              onPaginationChange={onUsersTablePaginate}
            />
          </>
        ) : (
          <Typography variant="body1">
            No unsubscribed segment found for this subscription group.
          </Typography>
        )}
      </Stack>
    </SubscriptionGroupLayout>
  );
}
