import { AddCircleOutline } from "@mui/icons-material";
import { IconButton, Stack, Typography } from "@mui/material";
import { MessageTemplate } from "@prisma/client";
import {
  ComputedPropertyStep,
  getPeriodsByComputedPropertyId,
} from "backend-lib/src/computedProperties/computePropertiesIncremental";
import { toSavedUserPropertyResource } from "backend-lib/src/userProperties";
import {
  ChannelType,
  CompletionStatus,
  MessageTemplateResourceDefinition,
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

    const messageTemplates = await prisma().messageTemplate.findMany({
      where: {
        workspaceId,
      },
    });
    const computedPropertyPeriods = await getPeriodsByComputedPropertyId({
      workspaceId,
      step: ComputedPropertyStep.ProcessAssignments,
    });

    const csps: Record<string, string> = {};
    for (const userPropertyResource of userPropertyResources) {
      const computedPropertyPeriod = computedPropertyPeriods.get({
        computedPropertyId: userPropertyResource.id,
        version: userPropertyResource.updatedAt.toString(),
      });
      if (computedPropertyPeriod !== undefined) {
        csps[userPropertyResource.id] = computedPropertyPeriod.version;
      }
    }

    const templatesUsedBy: Record<string, MessageTemplate[]> = {};

    for (const userPropertyResource of userPropertyResources) {
      for (const messageTemplate of messageTemplates) {
        const messageDefinition =
          messageTemplate.definition as MessageTemplateResourceDefinition;
        if (
          messageDefinition.body?.includes(`user.${userPropertyResource.name}`)
        ) {
          templatesUsedBy[userPropertyResource.id] =
            templatesUsedBy[userPropertyResource.id] ?? [];
          templatesUsedBy[userPropertyResource.id]?.push(messageTemplate);
        } else if (
          messageDefinition.type === ChannelType.Email &&
          messageDefinition.subject.includes(
            `user.${userPropertyResource.name}`,
          )
        ) {
          templatesUsedBy[userPropertyResource.id] =
            templatesUsedBy[userPropertyResource.id] ?? [];
          templatesUsedBy[userPropertyResource.id]?.push(messageTemplate);
        }
      }
    }

    const userProperties: AppState["userProperties"] = {
      type: CompletionStatus.Successful,
      value: userPropertyResources.map((userPropertyResource) => ({
        ...userPropertyResource,
        lastRecomputed: Number(new Date(Number(csps[userPropertyResource.id]))),
        templates: templatesUsedBy[userPropertyResource.id]
          ?.map(
            (template) =>
              `${template.name}|${template.id}|${(template.definition as MessageTemplateResourceDefinition).type}`,
          )
          ?.join(`, \n`),
      })),
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
