import { Box, Stack, Tabs, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { messageTemplatePath } from "isomorphic-lib/src/messageTemplates";
import { round } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BroadcastResource,
  ChannelType,
  CompletionStatus,
  JourneyNodeType,
  JourneyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useMemo } from "react";

import MainLayout from "../../components/mainLayout";
import TabLink from "../../components/tabLink";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../lib/appStore";
import prisma from "../../lib/prisma";
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
      prisma().journey.findMany({
        where: {
          workspaceId,
        },
        include: {
          Broadcast: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      findMessageTemplates({ workspaceId, includeInternal: true }),
    ]);
    const journeyResources: JourneyResource[] = [];
    const broadcastResources: BroadcastResource[] = [];

    for (const journey of journeys) {
      journeyResources.push(unwrap(toJourneyResource(journey)));
      for (const broadcast of journey.Broadcast ?? []) {
        broadcastResources.push(toBroadcastResource(broadcast));
      }
    }

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
            value: journeyResources,
          },
          broadcasts: broadcastResources,
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
  clickRate: number;
  deliveryRate: number;
  openRate: number;
  spamRate: number;
}

function StatCell({ value }: { value: number }) {
  return (
    <Box
      sx={{
        fontFamily: "monospace",
      }}
    >
      {round(value * 100, 2)}%
    </Box>
  );
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
    broadcasts,
  } = useAppStorePick([
    "journeyStats",
    "broadcasts",
    "journeys",
    "apiBase",
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
    journeyIds:
      journeys.type === CompletionStatus.Successful
        ? journeys.value.map((j) => j.id)
        : [],
    apiBase,
    setJourneyStatsRequest,
  });

  const broadcastByJourneyId = useMemo(
    () =>
      broadcasts.reduce((acc, broadcast) => {
        if (broadcast.journeyId) {
          acc.set(broadcast.journeyId, broadcast);
        }
        return acc;
      }, new Map<string, BroadcastResource>()),
    [broadcasts],
  );

  if (messages.type !== CompletionStatus.Successful) {
    return [];
  }

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
                `Message ${messageId} not found for journey ${journey.id}`,
              );
              return [];
            }
            const nodeStats = stats?.nodeStats[node.id];
            if (!message.definition) {
              return [];
            }

            const row: MessageRow = {
              id: `${journey.id}-${node.id}`,
              journeyName: journey.name,
              journeyId: journey.id,
              messageId,
              messageChannel: message.definition.type,
              messageName: message.name,
              sendRate: nodeStats?.sendRate ?? 0,
              clickRate: nodeStats?.channelStats.clickRate ?? 0,
              deliveryRate: nodeStats?.channelStats.deliveryRate ?? 0,
              openRate: nodeStats?.channelStats.openRate ?? 0,
              spamRate: nodeStats?.channelStats.spamRate ?? 0,
            };
            return row;
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
        autoHeight
        hideFooter
        columns={[
          {
            field: "journeyName",
            flex: 1,
            renderHeader: () => (
              <Tooltip title="Journey">
                <Typography variant="subtitle2">Journey / Broadcast</Typography>
              </Tooltip>
            ),
            renderCell: (params) => {
              const broadcast = broadcastByJourneyId.get(params.row.journeyId);
              const href = broadcast
                ? `/broadcasts/review/${broadcast.id}`
                : `/journeys/${params.row.journeyId}`;
              const name = broadcast ? broadcast.name : params.row.journeyName;
              return (
                <Tooltip title={name}>
                  <Link href={href}>{name}</Link>
                </Tooltip>
              );
            },
          },
          {
            field: "messageName",
            flex: 1,
            renderHeader: () => (
              <Tooltip title="Message">
                <Typography variant="subtitle2">Message</Typography>
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
            flex: 0.25,
            renderHeader: () => (
              <Typography variant="subtitle2">Send Rate</Typography>
            ),
            renderCell: (params) => <StatCell value={params.row.sendRate} />,
          },
          {
            field: "deliveryRate",
            flex: 0.25,
            renderHeader: () => (
              <Typography variant="subtitle2">Delivery Rate</Typography>
            ),
            renderCell: (params) => (
              <StatCell value={params.row.deliveryRate} />
            ),
          },
          {
            field: "openRate",
            flex: 0.25,
            renderHeader: () => (
              <Typography variant="subtitle2">Open Rate</Typography>
            ),
            renderCell: (params) => <StatCell value={params.row.openRate} />,
          },
          {
            field: "clickRate",
            flex: 0.25,
            renderHeader: () => (
              <Typography variant="subtitle2">Click Rate</Typography>
            ),
            renderCell: (params) => <StatCell value={params.row.clickRate} />,
          },
          {
            field: "spamRate",
            flex: 0.25,
            renderHeader: () => (
              <Typography variant="subtitle2">Spam Rate</Typography>
            ),
            renderCell: (params) => <StatCell value={params.row.spamRate} />,
          },
        ]}
      />
    </AnalysisLayout>
  );
}
