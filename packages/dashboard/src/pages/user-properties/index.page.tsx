import { AddCircleOutline } from "@mui/icons-material";
import { IconButton, Stack, Typography } from "@mui/material";
import { toSavedUserPropertyResource } from "backend-lib/src/userProperties";
import {
  CompletionStatus,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

import MainLayout from "../../components/mainLayout";
import UserPropertiesTable from "../../components/userPropertiesTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;

    const userPropertyResources: UserPropertyResource[] = (
      await prisma().userProperty.findMany({
        where: { workspaceId, resourceType: "Declarative" },
      })
    ).flatMap((segment) => {
      const result = toSavedUserPropertyResource(segment);
      if (result.isErr()) {
        return [];
      }
      return result.value;
    });
    const userProperties: AppState["userProperties"] = {
      type: CompletionStatus.Successful,
      value: userPropertyResources,
    };
    return {
      props: addInitialStateToProps({
        serverInitialState: {
          userProperties,
        },
        dfContext,
        props: {},
      }),
    };
  });

function UserPropertyListContents() {
  const path = useRouter();

  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        maxWidth: "40rem",
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          User Properties
        </Typography>
        <IconButton
          onClick={() => {
            path.push(`/user-properties/${uuid()}`);
          }}
        >
          <AddCircleOutline />
        </IconButton>
      </Stack>
      <UserPropertiesTable />
    </Stack>
  );
}
export default function UserPropertyList() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <UserPropertyListContents />
        </MainLayout>
      </main>
    </>
  );
}
