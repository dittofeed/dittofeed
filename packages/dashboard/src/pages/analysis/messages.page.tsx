import { Box, Stack, Tabs, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { findManyJourneys } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { CompletionStatus, JourneyNodeType } from "isomorphic-lib/src/types";
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
          <Stack direction="column" sx={{ width: "100%", p: 1 }} spacing={1}>
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
    const [journeys, messages] = await Promise.all([
      findManyJourneys({ where: { workspaceId } }).then(unwrap),
      findMessageTemplates({ workspaceId }),
    ]);

    return {
      props: addInitialStateToProps({
        props: {},
        serverInitialState: {
          messages: {
            type: CompletionStatus.Successful,
            value: messages,
          },
          journeys: {
            type: CompletionStatus.Successful,
            value: journeys,
          },
        },
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
    messages,
    workspace,
  } = useAppStorePick([
    "journeyStats",
    "journeys",
    "upsertJourneyStats",
    "setJourneyStatsRequest",
    "messages",
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

  if (messages.type !== CompletionStatus.Successful) {
    return [];
  }
  const rows =
    journeys.type === CompletionStatus.Successful
      ? journeys.value.flatMap((journey) =>
          journey.definition.nodes.flatMap((node) => {
            if (node.type !== JourneyNodeType.MessageNode) {
              return [];
            }
            const messageId = node.variant.templateId;
            const message = messages.value.find((m) => m.id === messageId);

            if (!message) {
              console.error(
                `Message ${messageId} not found for journey ${journey.id}`
              );
              return [];
            }

            return {
              id: `${journey.id}-${node.id}`,
              journeyName: journey.name,
              journeyId: journey.id,
              messageId,
              messageName: message.name,
            };
          })
        )
      : [];
  return (
    <AnalysisLayout tab="messages">
      <Typography sx={{ padding: 1 }} variant="h5">
        Journey Messages
      </Typography>

      <DataGrid
        columns={[
          { field: "journey" },
          { field: "template" },
          { field: "sendRate" },
        ]}
      />
      {journeys.type === CompletionStatus.Successful &&
        journeys.value.map((journey) => (
          <div key={journey.id}>
            <h2>{journey.name}</h2>
          </div>
        ))}
    </AnalysisLayout>
  );
}
