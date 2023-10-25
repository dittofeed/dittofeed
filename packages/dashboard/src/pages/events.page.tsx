import { Box, Stack } from "@mui/material";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React from "react";

import { EventsTable } from "../components/eventsTable";
import MainLayout from "../components/mainLayout";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => ({
    props: addInitialStateToProps({
      dfContext,
      props: {},
      serverInitialState: {},
    }),
  }));

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
