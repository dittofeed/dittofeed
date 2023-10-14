import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { getOrCreateBroadcast } from "backend-lib/src/broadcasts";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { isChannelType } from "isomorphic-lib/src/channels";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  JourneyBodyNode,
  JourneyNodeType,
  JourneyResource,
  MessageNode,
  MessageTemplateResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { validate } from "uuid";

import EmailEditor from "../../../components/messages/emailEditor";
import SmsEditor from "../../../components/messages/smsEditor";
import SubscriptionGroupAutocomplete from "../../../components/subscriptionGroupAutocomplete";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../../lib/appStore";
import { getEmailEditorState } from "../../../lib/email";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { getSmsEditorState } from "../../../lib/sms";
import { AppState, PropsWithInitialState } from "../../../lib/types";
import { useUpdateEffect } from "../../../lib/useUpdateEffect";
import { BroadcastLayout } from "../broadcastLayout";
import { getBroadcastAppState } from "../getBroadcastAppState";

function getChannel(routeChannel: unknown): ChannelType {
  return typeof routeChannel === "string" && isChannelType(routeChannel)
    ? routeChannel
    : ChannelType.Email;
}

async function getChannelState({
  workspaceId,
  channel,
  template,
}: {
  template: MessageTemplateResource;
  workspaceId: string;
  channel: ChannelType;
}): Promise<Partial<AppState> | null> {
  const userProperties = (
    await prisma().userProperty.findMany({
      where: {
        workspaceId,
      },
    })
  ).flatMap((up) => unwrap(toUserPropertyResource(up)));

  switch (channel) {
    case ChannelType.Email: {
      const state = getEmailEditorState({
        emailTemplate: template,
        userProperties,
        templateId: template.id,
      });
      return state;
    }
    case ChannelType.Sms: {
      const state = await getSmsEditorState({
        smsTemplate: template,
        userProperties,
        templateId: template.id,
      });
      return state;
    }
    case ChannelType.MobilePush:
      throw new Error("MobilePush not implemented");
    default:
      assertUnreachable(channel);
  }
}

interface BroadcastTemplateProps {
  templateId: string;
  journeyId: string;
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<BroadcastTemplateProps>
> = requestContext(async (ctx, dfContext) => {
  const id = ctx.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }

  const [{ broadcast, messageTemplate, journey }, subscriptionGroups] =
    await Promise.all([
      getOrCreateBroadcast({
        workspaceId: dfContext.workspace.id,
        broadcastId: id,
      }),
      prisma().subscriptionGroup.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);

  const channel = getChannel(ctx.query.channel);

  const baseAppState = getBroadcastAppState({ broadcast });
  if (broadcast.workspaceId !== dfContext.workspace.id) {
    return {
      notFound: true,
    };
  }
  const channelState = await getChannelState({
    channel,
    template: messageTemplate,
    workspaceId: dfContext.workspace.id,
  });

  const appState: Partial<AppState> = {
    ...baseAppState,
    ...channelState,
    subscriptionGroups: subscriptionGroups.map(subscriptionGroupToResource),
    journeys: {
      type: CompletionStatus.Successful,
      value: [journey],
    },
  };

  return {
    props: addInitialStateToProps({
      serverInitialState: appState,
      props: {
        templateId: messageTemplate.id,
        journeyId: journey.id,
      },
      dfContext,
    }),
  };
});

function getBroadcastMessageNode(
  journeyId: string,
  journeys: AppState["journeys"]
): MessageNode | null {
  if (journeys.type !== CompletionStatus.Successful) {
    return null;
  }
  const journey = journeys.value.find((j) => j.id === journeyId);
  if (!journey) {
    return null;
  }
  let messageNode: MessageNode | null = null;
  for (const node of journey.definition.nodes) {
    if (node.type === JourneyNodeType.MessageNode) {
      messageNode = node;
      break;
    }
  }
  return messageNode;
}

const BroadcastTemplate: NextPage<BroadcastTemplateProps> =
  function BroadcastTemplate({ templateId, journeyId }) {
    const router = useRouter();
    const { id, channel: routeChannel } = router.query;
    const channel = getChannel(routeChannel);
    const {
      apiBase,
      journeys,
      journeyUpdateRequest,
      setJourneyUpdateRequest,
      upsertJourney,
      broadcasts,
    } = useAppStorePick([
      "apiBase",
      "journeys",
      "upsertJourney",
      "journeyUpdateRequest",
      "setJourneyUpdateRequest",
      "broadcasts",
    ]);
    const messageNode = getBroadcastMessageNode(journeyId, journeys);
    const [subscriptionGroupId, setSubscriptionGroupId] = useState<
      string | null
    >(messageNode?.subscriptionGroupId ?? null);

    const theme = useTheme();
    const broadcast = useMemo(
      () => broadcasts.find((b) => b.id === id) ?? null,
      [broadcasts, id]
    );
    const started = broadcast?.status !== "NotStarted";

    useUpdateEffect(() => {
      if (journeys.type !== CompletionStatus.Successful) {
        return;
      }
      const journey = journeys.value.find((j) => j.id === journeyId);
      if (!journey) {
        return;
      }
      const nodes: JourneyBodyNode[] = journey.definition.nodes.map((node) => {
        if (node.type === JourneyNodeType.MessageNode) {
          const mn: MessageNode = {
            ...node,
            subscriptionGroupId: subscriptionGroupId ?? undefined,
          };
          return mn;
        }
        return node;
      });
      const body: UpsertJourneyResource = {
        id: journeyId,
        definition: {
          ...journey.definition,
          nodes,
        },
      };
      apiRequestHandlerFactory({
        request: journeyUpdateRequest,
        setRequest: setJourneyUpdateRequest,
        setResponse: upsertJourney,
        responseSchema: JourneyResource,
        onSuccessNotice: `Updated subscription group.`,
        onFailureNoticeHandler: () =>
          `API Error: Failed to update subscription group.`,
        requestConfig: {
          method: "PUT",
          url: `${apiBase}/api/journeys`,
          data: body,
          headers: {
            "Content-Type": "application/json",
          },
        },
      })();
    }, [subscriptionGroupId]);

    if (typeof id !== "string") {
      return null;
    }
    let templateEditor;
    switch (channel) {
      case ChannelType.Email:
        templateEditor = (
          <EmailEditor
            disabled={started}
            hideSaveButton
            hideTitle
            saveOnUpdate
            templateId={templateId}
            sx={{
              height: "100%",
            }}
          />
        );
        break;
      case ChannelType.Sms:
        templateEditor = (
          <SmsEditor
            templateId={templateId}
            hideSaveButton
            hideTitle
            saveOnUpdate
          />
        );
        break;
      case ChannelType.MobilePush:
        throw new Error("MobilePush not implemented");
      default:
        assertUnreachable(channel);
    }

    return (
      <BroadcastLayout activeStep="template" id={id}>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
          }}
        >
          <Typography fontWeight={400} variant="h2" sx={{ fontSize: 16 }}>
            Broadcast Message Template
          </Typography>
          <Button LinkComponent={Link} href={`/broadcasts/review/${id}`}>
            Next
          </Button>
          <FormControl>
            <InputLabel id="broadcast-channel-label">Channel</InputLabel>
            <Select
              label="Channel"
              labelId="broadcast-channel-label"
              sx={{
                minWidth: theme.spacing(10),
              }}
              onChange={(e) => {
                router.push({
                  query: {
                    id,
                    channel: e.target.value,
                  },
                });
              }}
              value={channel}
            >
              <MenuItem value={ChannelType.Email}>
                {CHANNEL_NAMES[ChannelType.Email]}
              </MenuItem>
              <MenuItem value={ChannelType.Sms}>
                {CHANNEL_NAMES[ChannelType.Sms]}
              </MenuItem>
              <MenuItem disabled value={ChannelType.MobilePush}>
                {CHANNEL_NAMES[ChannelType.MobilePush]}
              </MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ minWidth: "12rem" }}>
            <SubscriptionGroupAutocomplete
              subscriptionGroupId={subscriptionGroupId ?? undefined}
              channel={channel}
              handler={(sg) => {
                setSubscriptionGroupId(sg?.id ?? null);
              }}
            />
          </Box>
        </Stack>
        <Box
          sx={{
            flex: 1,
            width: "100%",
          }}
        >
          {templateEditor}
        </Box>
      </BroadcastLayout>
    );
  };
export default BroadcastTemplate;
