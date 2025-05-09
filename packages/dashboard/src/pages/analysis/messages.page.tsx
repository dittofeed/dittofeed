import { Box, Stack, Tabs, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { toJourneyResource } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { eq } from "drizzle-orm";
import { messageTemplatePath } from "isomorphic-lib/src/messageTemplates";
import { round } from "isomorphic-lib/src/numbers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  BroadcastResource,
  ChannelType,
  CompletionStatus,
  JourneyNodeType,
  NodeStatsType,
  SavedJourneyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useMemo } from "react";

import DashboardContent from "../../components/dashboardContent";
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
    <DashboardContent>
      <Stack direction="column" sx={{ width: "100%", p: 1 }} spacing={1}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabIndex}>
            <TabLink label="Messages" href={basePath} index={0} />
          </Tabs>
        </Box>
        <Box>{children}</Box>
      </Stack>
    </DashboardContent>
  );
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const { workspace } = dfContext;
    const workspaceId = workspace.id;
    const [journeys, messages] = await Promise.all([
      db().query.journey.findMany({
        where: eq(schema.journey.workspaceId, workspaceId),
        with: {
          broadcasts: true,
        },
        orderBy: (journey, { desc }) => [desc(journey.createdAt)],
      }),
      findMessageTemplates({ workspaceId, includeInternal: true }),
    ]);
    const journeyResources: SavedJourneyResource[] = [];
    const broadcastResources: BroadcastResource[] = [];

    for (const journey of journeys) {
      journeyResources.push(unwrap(toJourneyResource(journey)));
      for (const broadcast of journey.broadcasts) {
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

function StatCell({ value }: { value: number | string }) {
  return (
    <Box
      sx={{
        fontFamily: "monospace",
      }}
    >
      {typeof value === "number" ? `${round(value * 100, 2)}%` : value}
    </Box>
  );
}

export default function MessagesPage() {
  const {
    journeyStats,
    journeys,
    upsertJourneyStats,
    setJourneyStatsRequest,
    messages,
    broadcasts,
  } = useAppStorePick([
    "journeyStats",
    "broadcasts",
    "journeys",
    "upsertJourneyStats",
    "setJourneyStatsRequest",
    "messages",
  ]);
  useJourneyStats({
    upsertJourneyStats,
    journeyIds:
      journeys.type === CompletionStatus.Successful
        ? journeys.value.map((j) => j.id)
        : [],
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
          if (!journey.definition) {
            return [];
          }

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
            if (
              !message.definition ||
              !nodeStats ||
              nodeStats.type !== NodeStatsType.MessageNodeStats ||
              !nodeStats.sendRate
            ) {
              return [];
            }

            const row: MessageRow = {
              id: `${journey.id}-${node.id}`,
              journeyName: journey.name,
              journeyId: journey.id,
              messageId,
              messageChannel: message.definition.type,
              messageName: message.name,
              sendRate: nodeStats.sendRate,
              clickRate:
                nodeStats.channelStats?.type === ChannelType.Email
                  ? nodeStats.channelStats.clickRate
                  : 0,
              deliveryRate:
                nodeStats.channelStats &&
                "deliveryRate" in nodeStats.channelStats
                  ? nodeStats.channelStats.deliveryRate
                  : 0,
              spamRate:
                nodeStats.channelStats?.type === ChannelType.Email
                  ? nodeStats.channelStats.spamRate
                  : 0,
              openRate:
                nodeStats.channelStats?.type === ChannelType.Email
                  ? nodeStats.channelStats.openRate
                  : 0,
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
            renderCell: (params) => (
              <StatCell
                value={
                  params.row.messageChannel === ChannelType.Email
                    ? params.row.openRate
                    : "N/A"
                }
              />
            ),
          },
          {
            field: "clickRate",
            flex: 0.25,
            renderHeader: () => (
              <Typography variant="subtitle2">Click Rate</Typography>
            ),
            renderCell: (params) => (
              <StatCell
                value={
                  params.row.messageChannel === ChannelType.Email
                    ? params.row.clickRate
                    : "N/A"
                }
              />
            ),
          },
          {
            field: "spamRate",
            flex: 0.25,
            renderHeader: () => (
              <Typography variant="subtitle2">Spam Rate</Typography>
            ),
            renderCell: (params) => (
              <StatCell
                value={
                  params.row.messageChannel === ChannelType.Email
                    ? params.row.spamRate
                    : "N/A"
                }
              />
            ),
          },
        ]}
      />
    </AnalysisLayout>
  );
}
