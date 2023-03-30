import { Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { Type } from "@sinclair/typebox";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { GetUsersRequest } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useMemo } from "react";

import MainLayout from "../../components/mainLayout";
import UsersTable, {
  OnPaginationChangeProps,
} from "../../components/usersTable";

const QueryParams = Type.Pick(GetUsersRequest, ["cursor", "direction"]);

export default function SegmentUsers() {
  const theme = useTheme();
  const router = useRouter();
  const queryParams = useMemo(
    () => schemaValidate(router.query, QueryParams).unwrapOr({}),
    [router.query]
  );

  const onUsersTablePaginate = ({
    direction,
    cursor,
  }: OnPaginationChangeProps) => {
    router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        direction,
        cursor,
      },
    });
  };
  return (
    <MainLayout>
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Typography variant="h4">Users</Typography>
        <UsersTable
          {...queryParams}
          onPaginationChange={onUsersTablePaginate}
        />
      </Stack>
    </MainLayout>
  );
}
