import { AddCircleOutline } from "@mui/icons-material";
import { Button, Stack, Typography } from "@mui/material";
import { findManyJourneyResourcesUnsafe } from "backend-lib/src/journeys";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useState } from "react";
import { v4 as uuid } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import JourneysTable from "../../components/journeysTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;
    const journeys = await findManyJourneyResourcesUnsafe({
      where: { workspaceId, resourceType: "Declarative" },
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
  const [newId, setNewId] = useState(uuid());

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
        <Button
          variant="contained"
          startIcon={<AddCircleOutline />}
          LinkComponent={Link}
          href={`/journeys/${newId}`}
          onClick={() => {
            setNewId(uuid());
          }}
        >
          Create Journey
        </Button>
      </Stack>
      <JourneysTable />
    </Stack>
  );
}

function Journeys() {
  return (
    <DashboardContent>
      <JourneyListContents />
    </DashboardContent>
  );
}
export default Journeys;
