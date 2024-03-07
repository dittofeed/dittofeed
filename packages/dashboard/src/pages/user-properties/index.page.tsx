import { AddCircleOutline } from "@mui/icons-material";
import { IconButton, Stack, Typography } from "@mui/material";
import {
  ComputedPropertyStep,
  getPeriodsByComputedPropertyId,
} from "backend-lib/src/computedProperties/computePropertiesIncremental";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { toSavedUserPropertyResource } from "backend-lib/src/userProperties";
import { CompletionStatus } from "isomorphic-lib/src/types";
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

    const [userPropertyResources, templateResources, computedPropertyPeriods] =
      await Promise.all([
        prisma()
          .userProperty.findMany({
            where: { workspaceId, resourceType: "Declarative" },
          })
          .then((userProperties) => {
            return userProperties.flatMap((up) => {
              const result = toSavedUserPropertyResource(up);
              if (result.isErr()) {
                return [];
              }
              return result.value;
            });
          }),
        findMessageTemplates({
          workspaceId,
        }),
        getPeriodsByComputedPropertyId({
          workspaceId,
          step: ComputedPropertyStep.ProcessAssignments,
        }),
      ]);

    const userProperties: AppState["userProperties"] = {
      type: CompletionStatus.Successful,
      value: userPropertyResources.map((userPropertyResource) => ({
        ...userPropertyResource,
        lastRecomputed: computedPropertyPeriods
          .get({
            computedPropertyId: userPropertyResource.id,
            version: userPropertyResource.updatedAt.toString(),
          })
          ?.maxTo.getTime(),
      })),
    };
    const messages: AppState["messages"] = {
      type: CompletionStatus.Successful,
      value: templateResources,
    };
    return {
      props: addInitialStateToProps({
        serverInitialState: {
          userProperties,
          messages,
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
        bgcolor: "background.paper",
        borderRadius: 1,
        margin: "1rem",
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
