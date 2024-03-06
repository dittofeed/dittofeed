import { AddCircleOutline } from "@mui/icons-material";
import { IconButton, Stack, Typography } from "@mui/material";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  JourneyDefinition,
  JourneyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

import JourneysTable from "../../components/journeysTable";
import MainLayout from "../../components/mainLayout";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;
    const journeys = (
      await prisma().journey.findMany({
        where: { workspaceId, resourceType: "Declarative" },
      })
    ).flatMap(({ id, definition, name, status, updatedAt }) => {
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
        updatedAt: Number(updatedAt),
      };
      return resource;
    });

    const serverInitialState: PreloadedState = {
      journeys: {
        type: CompletionStatus.Successful,
        value: journeys,
      },
    };

    const props = addInitialStateToProps({
      serverInitialState,
      dfContext,
      props: {},
    });
    return {
      props,
    };
  });

function JourneyListContents() {
  const path = useRouter();

  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        borderRadius: 1,
        margin: "1rem",
        bgcolor: "background.paper",
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          Journeys
        </Typography>
        <IconButton
          onClick={() => {
            path.push(`/journeys/${uuid()}`);
          }}
        >
          <AddCircleOutline />
        </IconButton>
      </Stack>
      <JourneysTable />
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
