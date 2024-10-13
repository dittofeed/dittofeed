import { AddCircleOutline } from "@mui/icons-material";
import { Button, Stack, Typography } from "@mui/material";
import { getPeriodsByComputedPropertyId } from "backend-lib/src/computedProperties/periods";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { ComputedPropertyStep } from "backend-lib/src/types";
import { toSavedUserPropertyResource } from "backend-lib/src/userProperties";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import UserPropertiesTable from "../../components/userPropertiesTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import {
  AppState,
  PropsWithInitialState,
  UserPropertyMessages,
} from "../../lib/types";

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
      value: userPropertyResources.map((userPropertyResource) => {
        const lastRecomputed = computedPropertyPeriods
          .get({
            computedPropertyId: userPropertyResource.id,
            version: userPropertyResource.definitionUpdatedAt.toString(),
          })
          ?.maxTo.getTime();
        return {
          ...userPropertyResource,
          lastRecomputed,
        };
      }),
    };

    const userPropertyMessages: UserPropertyMessages = {};

    for (const userPropertyResource of userPropertyResources) {
      for (const messageTemplate of templateResources) {
        const definition = messageTemplate.draft ?? messageTemplate.definition;
        if (!definition) {
          continue;
        }
        for (const [key, value] of Object.entries(definition)) {
          if (
            key === "type" ||
            typeof value !== "string" ||
            !value.includes(`user.${userPropertyResource.name}`)
          ) {
            continue;
          }
          const templates = userPropertyMessages[userPropertyResource.id] ?? {};
          templates[userPropertyResource.id] = templates[
            userPropertyResource.id
          ] ?? {
            name: messageTemplate.name,
            type: definition.type,
          };
          userPropertyMessages[userPropertyResource.id] = templates;
        }
      }
    }

    return {
      props: addInitialStateToProps({
        serverInitialState: {
          userProperties,
          userPropertyMessages,
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
        <Button
          variant="contained"
          startIcon={<AddCircleOutline />}
          onClick={() => {
            path.push(`/user-properties/${uuid()}`);
          }}
        >
          Create User Property
        </Button>
      </Stack>
      <UserPropertiesTable />
    </Stack>
  );
}

export default function UserPropertyList() {
  return (
    <DashboardContent>
      <UserPropertyListContents />
    </DashboardContent>
  );
}
