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
import { toSavedUserPropertyResource } from "backend-lib/src/userProperties";
import { isChannelType } from "isomorphic-lib/src/channels";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  EphemeralRequestStatus,
  JourneyBodyNode,
  JourneyNodeType,
  MessageNode,
  MessageTemplateResource,
  ResetMessageTemplateResource,
  SavedJourneyResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { useImmer } from "use-immer";
import { validate } from "uuid";

import EmailEditor from "../../../components/messages/emailEditor";
import SmsEditor from "../../../components/messages/smsEditor";
import WebhookEditor from "../../../components/messages/webhookEditor";
import SubscriptionGroupAutocomplete from "../../../components/subscriptionGroupAutocomplete";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../../lib/appStore";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
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
  template,
}: {
  template: MessageTemplateResource;
  workspaceId: string;
}): Promise<Partial<AppState> | null> {
  const userProperties = (
    await prisma().userProperty.findMany({
      where: {
        workspaceId,
      },
    })
  ).flatMap((up) => unwrap(toSavedUserPropertyResource(up)));
  return {
    userProperties: {
      type: CompletionStatus.Successful,
      value: userProperties,
    },
    messages: {
      type: CompletionStatus.Successful,
      value: [template],
    },
  };
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

  let name: string;
  if (typeof ctx.query.name === "string") {
    name = ctx.query.name;
  } else {
    name = `Broadcast - ${id}`;
  }

  const [{ broadcast, messageTemplate, journey }, subscriptionGroups] =
    await Promise.all([
      getOrCreateBroadcast({
        workspaceId: dfContext.workspace.id,
        name,
        broadcastId: id,
      }),
      prisma().subscriptionGroup.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);

  const baseAppState = getBroadcastAppState({ broadcast });
  if (broadcast.workspaceId !== dfContext.workspace.id) {
    return {
      notFound: true,
    };
  }
  const channelState = await getChannelState({
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
  journeys: AppState["journeys"],
): MessageNode | null {
  if (journeys.type !== CompletionStatus.Successful) {
    return null;
  }
  const journey = journeys.value.find((j) => j.id === journeyId);
  if (!journey || !journey.definition) {
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

interface BroadcastTemplateState {
  updateTemplateRequest: EphemeralRequestStatus<Error>;
}

const BroadcastTemplate: NextPage<BroadcastTemplateProps> =
  function BroadcastTemplate({ templateId, journeyId }) {
    const router = useRouter();
    const { id, channel: routeChannel } = router.query;
    const [{ updateTemplateRequest }, setState] =
      useImmer<BroadcastTemplateState>({
        updateTemplateRequest: {
          type: CompletionStatus.NotStarted,
        },
      });
    const channel = getChannel(routeChannel);
    const {
      apiBase,
      journeys,
      journeyUpdateRequest,
      setJourneyUpdateRequest,
      upsertJourney,
      broadcasts,
      upsertTemplate,
    } = useAppStorePick([
      "apiBase",
      "journeys",
      "upsertJourney",
      "upsertTemplate",
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
      [broadcasts, id],
    );
    const started = broadcast?.status !== "NotStarted";
    const disabled =
      started || updateTemplateRequest.type === CompletionStatus.InProgress;

    useUpdateEffect(() => {
      if (journeys.type !== CompletionStatus.Successful || disabled) {
        return;
      }
      const journey = journeys.value.find((j) => j.id === journeyId);
      if (!journey?.definition) {
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
        workspaceId: journey.workspaceId,
        definition: {
          ...journey.definition,
          nodes,
        },
      };
      apiRequestHandlerFactory({
        request: journeyUpdateRequest,
        setRequest: setJourneyUpdateRequest,
        setResponse: upsertJourney,
        responseSchema: SavedJourneyResource,
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
            disabled={disabled}
            hideTitle
            hidePublisher
            templateId={templateId}
          />
        );
        break;
      case ChannelType.Sms:
        templateEditor = (
          <SmsEditor
            templateId={templateId}
            hideTitle
            hidePublisher
            disabled={disabled}
          />
        );
        break;
      case ChannelType.MobilePush:
        throw new Error("MobilePush not implemented");
      case ChannelType.Webhook:
        templateEditor = (
          <WebhookEditor
            disabled={disabled}
            hideTitle
            hidePublisher
            templateId={templateId}
          />
        );
        break;
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
              disabled={disabled}
              label="Channel"
              labelId="broadcast-channel-label"
              sx={{
                minWidth: theme.spacing(10),
              }}
              onChange={(e) => {
                if (!broadcast) {
                  return;
                }
                const newChannel = e.target.value as ChannelType;
                apiRequestHandlerFactory({
                  request: updateTemplateRequest,
                  setRequest: (req) =>
                    setState((draft) => {
                      draft.updateTemplateRequest = req;
                    }),
                  setResponse: (template) => {
                    upsertTemplate(template);
                    router.push({
                      query: {
                        id,
                        channel: newChannel,
                      },
                    });
                  },
                  responseSchema: MessageTemplateResource,
                  onFailureNoticeHandler: () =>
                    `API Error: Failed to update template channel.`,
                  requestConfig: {
                    method: "PUT",
                    url: `${apiBase}/api/content/templates/reset`,
                    data: {
                      workspaceId: broadcast.workspaceId,
                      id: templateId,
                      type: newChannel,
                      journeyMetadata: {
                        journeyId,
                        nodeId: "broadcast-message",
                      },
                    } satisfies ResetMessageTemplateResource,
                    headers: {
                      "Content-Type": "application/json",
                    },
                  },
                })();
              }}
              value={channel}
            >
              <MenuItem value={ChannelType.Email}>
                {CHANNEL_NAMES[ChannelType.Email]}
              </MenuItem>
              <MenuItem value={ChannelType.Sms}>
                {CHANNEL_NAMES[ChannelType.Sms]}
              </MenuItem>
              <MenuItem value={ChannelType.Webhook}>
                {CHANNEL_NAMES[ChannelType.Webhook]}
              </MenuItem>
              <MenuItem disabled value={ChannelType.MobilePush}>
                {CHANNEL_NAMES[ChannelType.MobilePush]}
              </MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ minWidth: "12rem" }}>
            <SubscriptionGroupAutocomplete
              subscriptionGroupId={subscriptionGroupId ?? undefined}
              disabled={disabled}
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
