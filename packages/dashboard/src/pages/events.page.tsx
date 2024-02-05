import { Box, Stack } from "@mui/material";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React from "react";

import { EventsTable } from "../components/eventsTable";
import MainLayout from "../components/mainLayout";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import prisma from "../lib/prisma";
import { requestContext } from "../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const [messageTemplates, broadcasts, journeys] = await Promise.all([
      findMessageTemplates({
        workspaceId: dfContext.workspace.id,
      }),
      prisma().broadcast.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
      prisma().journey.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);
    const serverInitialState: PreloadedState = {
      messages: {
        type: CompletionStatus.Successful,
        value: messageTemplates,
      },
      broadcasts: broadcasts.map(toBroadcastResource),
      journeys: {
        type: CompletionStatus.Successful,
        value: journeys.flatMap((j) => toJourneyResource(j).unwrapOr([])),
      },
    };
    return {
      props: addInitialStateToProps({
        serverInitialState,
        props: {},
        dfContext,
      }),
    };
  });

export default function Events() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <MainLayout>
        <Stack
          direction="column"
          alignItems="center"
          justifyContent="center"
          paddingBottom={2}
          paddingTop={2}
          sx={{ width: "100%", height: "100%", padding: 2 }}
        >
          <Box sx={{ width: "100%", height: "100%" }}>
            <EventsTable />
          </Box>
        </Stack>
      </MainLayout>
    </>
  );
}
