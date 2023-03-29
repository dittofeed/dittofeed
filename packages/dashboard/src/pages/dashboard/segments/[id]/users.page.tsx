import { Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { Type } from "@sinclair/typebox";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { GetUsersRequest } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useMemo } from "react";

import UsersTable from "../../../../components/usersTable";
import { useAppStore } from "../../../../lib/appStore";
import getSegmentServerSideProps from "./getSegmentServerSideProps";
import SegmentLayout from "./segmentLayout";

export const getServerSideProps = getSegmentServerSideProps;

const QueryParams = Type.Pick(GetUsersRequest, ["cursor", "direction"]);

export default function SegmentUsers() {
  const editedSegment = useAppStore((state) => state.editedSegment);
  const theme = useTheme();
  const router = useRouter();
  const queryParams = useMemo(
    () => schemaValidate(router.query, QueryParams).unwrapOr({}),
    [router.query]
  );

  if (!editedSegment) {
    return null;
  }
  const { name } = editedSegment;
  return (
    <SegmentLayout segmentId={editedSegment.id} tab="users">
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Typography variant="h4">Users in &quot;{name}&quot;</Typography>
        <UsersTable segmentId={editedSegment.id} {...queryParams} />
      </Stack>
    </SegmentLayout>
  );
}
