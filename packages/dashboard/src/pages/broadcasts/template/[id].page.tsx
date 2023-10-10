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
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { isChannelType } from "isomorphic-lib/src/channels";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { ChannelType, MessageTemplateResource } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { validate } from "uuid";

import EmailEditor from "../../../components/messages/emailEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { getEmailEditorState } from "../../../lib/email";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../../lib/types";
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
      const state = await getEmailEditorState({
        emailTemplate: template,
        userProperties,
      });
      return state;
    }
    case ChannelType.Sms:
      throw new Error("Sms not implemented");
      break;
    case ChannelType.MobilePush:
      throw new Error("MobilePush not implemented");
    default:
      assertUnreachable(channel);
  }
}

interface BroadcastTemplateProps {
  templateId: string;
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

  const { broadcast, messageTemplate } = await getOrCreateBroadcast({
    workspaceId: dfContext.workspace.id,
    broadcastId: id,
  });

  console.log("loc2", messageTemplate);
  const channel = getChannel(ctx.query.channel);

  const baseAppState = getBroadcastAppState({ broadcast });
  const channelState = await getChannelState({
    channel,
    template: messageTemplate,
    workspaceId: dfContext.workspace.id,
  });

  const appState: Partial<AppState> = {
    ...baseAppState,
    ...channelState,
  };

  return {
    props: addInitialStateToProps({
      serverInitialState: appState,
      props: {
        templateId: messageTemplate.id,
      },
      dfContext,
    }),
  };
});

const BroadcastConfigure: NextPage<BroadcastTemplateProps> =
  function BroadcastConfigure({ templateId }) {
    const router = useRouter();
    const { id, channel: routeChannel } = router.query;
    const channel = getChannel(routeChannel);

    const theme = useTheme();

    if (typeof id !== "string") {
      return null;
    }
    let templateEditor;
    switch (channel) {
      case ChannelType.Email:
        templateEditor = (
          <EmailEditor
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
        // FIXME
        throw new Error("Sms not implemented");
        break;
      case ChannelType.MobilePush:
        throw new Error("MobilePush not implemented");
      default:
        assertUnreachable(channel);
    }

    // FIXME allow user to select subscription group id
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
          <Button
            LinkComponent={Link}
            href={`/dashboard/broadcasts/segment/${id}`}
          >
            Next
          </Button>
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
export default BroadcastConfigure;
