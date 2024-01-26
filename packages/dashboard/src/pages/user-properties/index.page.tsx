import { AddCircleOutline } from "@mui/icons-material";
import { IconButton, Stack, Typography } from "@mui/material";
import { ComputedPropertyPeriod, MessageTemplate } from "@prisma/client";
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
    const computedPropertyPeriods =
      await prisma().computedPropertyPeriod.findMany({
        where: {
          workspaceId,
        },
      });

    const csps: Record<string, ComputedPropertyPeriod> = {};
    for (const userPropertyResource of userPropertyResources) {
      for (const computedPropertyPeriod of computedPropertyPeriods) {
        if (computedPropertyPeriod.id === userPropertyResource.id) {
          csps[userPropertyResource.id] = computedPropertyPeriod;
        }
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
            `user.${userPropertyResource.name}`
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
        lastRecomputed: Number(
          new Date(csps[userPropertyResource.id]?.createdAt ?? "")
        ),
        templates:
          templatesUsedBy[userPropertyResource.id] &&
          templatesUsedBy[userPropertyResource.id]?.length !== 0
            ? templatesUsedBy[userPropertyResource.id]
                ?.map((template) => `${template.name}`)
                ?.join(`, \n`)
            : "No Templates",
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
        maxWidth: "60rem",
        height: "100%",
        maxHeight: "70%",
        border: 1,
        borderRadius: 1,
        borderColor: "grey.400",
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
