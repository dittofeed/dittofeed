import { Box, Stack, Tabs, Tooltip, Typography } from "@mui/material";
import { DataGrid, gridStringOrNumberComparator } from "@mui/x-data-grid";
import { findManyJourneys } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { messageTemplatePath } from "isomorphic-lib/src/messageTemplates";
import { round } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  ChannelType,
  CompletionStatus,
  JourneyNodeType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";

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

interface MessageRow {
  id: string;
  journeyName: string;
  journeyId: string;
  messageId: string;
  messageChannel: ChannelType;
  messageName: string;
  sendRate: number;
}

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
  // FIXME 1 journey missing
  const rows: MessageRow[] =
    journeys.type === CompletionStatus.Successful
      ? journeys.value.flatMap((journey) => {
          const stats = journeyStats[journey.id];

          return journey.definition.nodes.flatMap((node) => {
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
            const nodeStats = stats?.nodeStats[node.id];

            return {
              id: `${journey.id}-${node.id}`,
              journeyName: journey.name,
              journeyId: journey.id,
              messageId,
              messageChannel: message.definition.type,
              messageName: message.name,
              sendRate: nodeStats?.sendRate ?? 0,
            };
          });
        })
      : [];

  return (
    <AnalysisLayout tab="messages">
      <Typography sx={{ padding: 1 }} variant="h5">
        Journey Messages
      </Typography>
      <DataGrid
        rows={rows}
        sx={{ width: "100%" }}
        getRowId={(row) => row.id}
        hideFooter
        columns={[
          {
            field: "journeyName",
            flex: 1,
            renderHeader: () => (
              <Tooltip title="Journey">
                <Typography>Journey</Typography>
              </Tooltip>
            ),
            renderCell: (params) => (
              <Tooltip title={params.row.journeyName}>
                <Link href={`/journeys/${params.row.journeyId}`}>
                  {params.row.journeyName}
                </Link>
              </Tooltip>
            ),
          },
          {
            field: "messageName",
            flex: 1,
            renderHeader: () => (
              <Tooltip title="Message">
                <Typography>Message</Typography>
              </Tooltip>
            ),
            renderCell: (params) => (
              <Tooltip title={params.row.messageName}>
                <Link
                  href={messageTemplatePath({
                    id: params.row.messageId,
                    channel: params.row.messageChannel,
                  })}
                >
                  {params.row.messageName}
                </Link>
              </Tooltip>
            ),
          },
          {
            field: "sendRate",
            flex: 0.5,
            renderCell: (params) => (
              <Box
                sx={{
                  fontFamily: "monospace",
                }}
              >
                {round(params.row.sendRate * 100, 2)}%
              </Box>
            ),
          },
        ]}
      />
    </AnalysisLayout>
  );
}
