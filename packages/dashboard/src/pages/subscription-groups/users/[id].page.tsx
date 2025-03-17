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

export default function SubscriptionGroupUsers() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : undefined;

  const segmentsResult = useAppStore((store) => store.segments);
  const workspace = useAppStore((store) => store.workspace);
  const editedSubscriptionGroup = useAppStore(
    (store) => store.editedSubscriptionGroup,
  );

  const queryParams = useMemo(
    () => schemaValidate(router.query, UsersTableParams).unwrapOr({}),
    [router.query],
  );

  const segment = useMemo(
    () =>
      segmentsResult.type === CompletionStatus.Successful
        ? segmentsResult.value.find((s) => s.subscriptionGroupId === id)
        : undefined,
    [segmentsResult, id],
  );
  if (!id) {
    return new Error("Missing id");
  }
  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  const onUsersTablePaginate = usersTablePaginationHandler(router);

  if (!editedSubscriptionGroup) {
    console.error("missing editedSubscriptionGroup");
    return null;
  }

  return (
    <SubscriptionGroupLayout tab={SubscriptionGroupTabLabel.Users} id={id}>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
        {segment ? (
          <>
            <Typography variant="h4">
              Users in &quot;{editedSubscriptionGroup.name}&quot;
            </Typography>
            <UsersTableV2
              workspaceId={workspace.value.id}
              subscriptionGroupFilter={[id]}
              {...queryParams}
              onPaginationChange={onUsersTablePaginate}
            />
          </>
        ) : null}
      </Stack>
    </SubscriptionGroupLayout>
  );
}
