import { Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { Type } from "@sinclair/typebox";
import { findManyPartialSegments } from "backend-lib/src/segments";
import { findAllUserPropertyResources } from "backend-lib/src/userProperties";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus, GetUsersRequest } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import DashboardContent from "../components/dashboardContent";
import { UsersFilter } from "../components/usersFilter";
import UsersTableV2, {
  OnPaginationChangeProps,
} from "../components/usersTableV2";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { useAppStore } from "../lib/appStore";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

const QueryParams = Type.Pick(GetUsersRequest, ["cursor", "direction"]);

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const [segments, userProperties] = await Promise.all([
      findManyPartialSegments({
        workspaceId: dfContext.workspace.id,
      }),
      findAllUserPropertyResources({
        workspaceId: dfContext.workspace.id,
      }),
    ]);
    return {
      props: addInitialStateToProps({
        serverInitialState: {
          segments: {
            type: CompletionStatus.Successful,
            value: segments,
          },
          userProperties: {
            type: CompletionStatus.Successful,
            value: userProperties,
          },
        },
        dfContext,
        props: {},
      }),
    };
  });

export default function SegmentUsers() {
  const theme = useTheme();
  const router = useRouter();
  const queryParams = useMemo(
    () => schemaValidate(router.query, QueryParams).unwrapOr({}),
    [router.query],
  );
  const workspace = useAppStore((state) => state.workspace);
  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }

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
    <DashboardContent>
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Stack direction="row">
          <Typography variant="h4">Users</Typography>
        </Stack>
        <UsersFilter />
        <UsersTableV2
          {...queryParams}
          workspaceId={workspace.value.id}
          onPaginationChange={onUsersTablePaginate}
        />
      </Stack>
    </DashboardContent>
  );
}
