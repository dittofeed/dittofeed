import { AddCircleOutline } from "@mui/icons-material";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  JourneyDefinition,
  JourneyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

import MainLayout from "../../../components/mainLayout";
import {
  addInitialStateToProps,
  PreloadedState,
  PropsWithInitialState,
  useAppStore,
} from "../../../lib/appStore";
import prisma from "../../../lib/prisma";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  const workspaceId = backendConfig().defaultWorkspaceId;

  const [journeys, workspace] = await Promise.all([
    (
      await prisma().journey.findMany({
        where: { workspaceId },
      })
    ).flatMap(({ id, definition, name, status }) => {
      const validatedDefinition = schemaValidate(definition, JourneyDefinition);
      if (validatedDefinition.isErr()) {
        return [];
      }
      const resource: JourneyResource = {
        definition: validatedDefinition.value,
        id,
        workspaceId,
        name,
        status,
      };
      return resource;
    }),
    prisma().workspace.findFirst({
      where: { id: workspaceId },
    }),
  ]);

  const serverInitialState: PreloadedState = {
    journeys: {
      type: CompletionStatus.Successful,
      value: journeys,
    },
  };

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

  const props = addInitialStateToProps({}, serverInitialState);
  return {
    props,
  };
};

function JourneyListContents() {
  const path = useRouter();
  const journeysResult = useAppStore((store) => store.journeys);
  const journeys =
    journeysResult.type === CompletionStatus.Successful
      ? journeysResult.value
      : [];

  let innerContents;
  if (journeys.length) {
    innerContents = (
      <List
        sx={{
          padding: 1,
          width: "100%",
          bgcolor: "background.paper",
          borderRadius: 1,
        }}
      >
        {journeys.map((segment) => (
          <ListItem disableGutters key={segment.id}>
            <ListItemButton
              onClick={() => {
                path.push(`/dashboard/journeys/${segment.id}`);
              }}
            >
              <ListItemText primary={segment.name} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    );
  } else {
    innerContents = null;
  }

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
          Journeys
        </Typography>
        <IconButton
          onClick={() => {
            path.push(`/dashboard/journeys/${uuid()}`);
          }}
        >
          <AddCircleOutline />
        </IconButton>
      </Stack>
      {innerContents}
    </Stack>
  );
}

function Journeys() {
  return (
    <MainLayout>
      <JourneyListContents />
    </MainLayout>
  );
}
export default Journeys;
