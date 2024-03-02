import { Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useMemo } from "react";

import UsersTable, {
  usersTablePaginationHandler,
  UsersTableParams,
} from "../../../components/usersTable";
import { useAppStore } from "../../../lib/appStore";
import getSegmentServerSideProps from "./getSegmentServerSideProps";
import SegmentLayout from "./segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

export default function SegmentUsers() {
  const editedSegment = useAppStore((state) => state.editedSegment);
  const theme = useTheme();
  const router = useRouter();
  const workspace = useAppStore((state) => state.workspace);
  const queryParams = useMemo(
    () => schemaValidate(router.query, UsersTableParams).unwrapOr({}),
    [router.query],
  );

  if (!editedSegment) {
    return null;
  }

  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }
  const { name } = editedSegment;
  const onUsersTablePaginate = usersTablePaginationHandler(router);
  return (
    <SegmentLayout segmentId={editedSegment.id} tab="users">
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Typography variant="h4">Users in &quot;{name}&quot;</Typography>
        <UsersTable
          workspaceId={workspace.value.id}
          segmentFilter={[editedSegment.id]}
          {...queryParams}
          onPaginationChange={onUsersTablePaginate}
        />
      </Stack>
    </SegmentLayout>
  );
}
