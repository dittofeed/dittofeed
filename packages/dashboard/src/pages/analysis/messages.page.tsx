import { Box, Stack, Tabs } from "@mui/material";
import { findManyJourneys } from "backend-lib/src/journeys";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";

import MainLayout from "../../components/mainLayout";
import TabLink from "../../components/tabLink";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../lib/appStore";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";
import { useJourneyStats } from "../../lib/useJourneyStats";

type Tab = "messages";

const TAB_INDEX: Record<Tab, number> = {
  messages: 0,
};

function AnalysisLayout({
  children,
  tab,
}: {
  tab: Tab;
  children?: React.ReactNode;
}) {
  const basePath = `/analysis`;
  const tabIndex = TAB_INDEX[tab];

  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <Stack direction="column" sx={{ width: "100%" }}>
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tabs value={tabIndex}>
                <TabLink label="Messages" href={basePath} index={0} />
              </Tabs>
            </Box>
            <Box>{children}</Box>
          </Stack>
        </MainLayout>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const { workspace } = dfContext;
    const workspaceId = workspace.id;
    const [] = await Promise.all([
      findManyJourneys({ where: { workspaceId } }).then(unwrap),
    ]);

    return {
      props: addInitialStateToProps({
        props: {},
        serverInitialState: {},
        dfContext,
      }),
    };
  });

export default function MessagesPage() {
  const {
    journeyStats,
    apiBase,
    journeys,
    upsertJourneyStats,
    setJourneyStatsRequest,
    workspace,
  } = useAppStorePick([
    "journeyStats",
    "journeys",
    "upsertJourneyStats",
    "setJourneyStatsRequest",
    "workspace",
  ]);
  useJourneyStats({
    workspaceId:
      workspace.type === CompletionStatus.Successful
        ? workspace.value.id
        : undefined,
    upsertJourneyStats,
    apiBase,
    setJourneyStatsRequest,
  });

  return (
    <AnalysisLayout tab="messages">
      <h1>Messages</h1>
      {journeys.type === CompletionStatus.Successful &&
        journeys.value.map((journey) => (
          <div key={journey.id}>
            <h2>{journey.name}</h2>
          </div>
        ))}
    </AnalysisLayout>
  );
}
