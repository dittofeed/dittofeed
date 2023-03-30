import { Typography, useTheme } from "@mui/material";
import Stack from "@mui/material/Stack";
import { Type } from "@sinclair/typebox";
import backendConfig from "backend-lib/src/config";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { CompletionStatus, GetUsersRequest } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useMemo } from "react";

import MainLayout from "../../components/mainLayout";
import UsersTable, {
  OnPaginationChangeProps,
} from "../../components/usersTable";
import {
  addInitialStateToProps,
  PreloadedState,
  PropsWithInitialState,
} from "../../lib/appStore";
import prisma from "../../lib/prisma";

const QueryParams = Type.Pick(GetUsersRequest, ["cursor", "direction"]);

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  const workspaceId = backendConfig().defaultWorkspaceId;
  const serverInitialState: PreloadedState = {};

  const [workspace] = await Promise.all([
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
  ]);

  if (workspace) {
    // TODO PLI-212
    serverInitialState.workspace = {
      type: CompletionStatus.Successful,
      value: {
        id: workspaceId,
        name: workspace.name,
      },
    };
  }

  return {
    props: addInitialStateToProps({}, serverInitialState),
  };
};

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
