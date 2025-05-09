import { Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { useRouter } from "next/router";
import { useMemo } from "react";

import UsersTableV2, {
  usersTablePaginationHandler,
  UsersTableParams,
} from "../../../components/usersTableV2";
import { useSegmentQuery } from "../../../lib/useSegmentQuery";
import getSegmentServerSideProps from "./getSegmentServerSideProps";
import SegmentLayout from "./segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

export default function SegmentUsers() {
  const theme = useTheme();
  const router = useRouter();
  const queryParams = useMemo(
    () => schemaValidate(router.query, UsersTableParams).unwrapOr({}),
    [router.query],
  );
  const segmentId =
    typeof router.query.id === "string" ? router.query.id : null;

  const { data: segment } = useSegmentQuery(segmentId ?? undefined);

  if (!segmentId) {
    return null;
  }

  const onUsersTablePaginate = usersTablePaginationHandler(router);
  return (
    <SegmentLayout segmentId={segmentId} tab="users">
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        {segment ? (
          <>
            <Typography variant="h4">
              Users in &quot;{segment.name}&quot;
            </Typography>
            <UsersTableV2
              segmentFilter={[segmentId]}
              {...queryParams}
              onPaginationChange={onUsersTablePaginate}
            />
          </>
        ) : null}
      </Stack>
    </SegmentLayout>
  );
}
