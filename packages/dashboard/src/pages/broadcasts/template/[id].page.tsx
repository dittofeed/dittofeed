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
import { isChannelType } from "isomorphic-lib/src/channels";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { ChannelType } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";

import EmailEditor from "../../../components/messages/emailEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { getEmailEditorState } from "../../../lib/email";
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
  templateId,
  workspaceId,
  channel,
}: {
  templateId: string;
  workspaceId: string;
  channel: ChannelType;
}): Promise<Partial<AppState> | null> {
  switch (channel) {
    case ChannelType.Email: {
      return null;
      // const state = await getEmailEditorState({
      //   templateId,
      //   workspaceId,
      // });
      // return state;
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

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const channel = getChannel(ctx.query.channel);

    const [baseAppState, channelState] = await Promise.all([
      getBroadcastAppState({
        ctx,
        workspaceId: dfContext.workspace.id,
      }),
      getChannelState({
        channel,
        // FIXME not right,
        // pass name of template
        templateId: ctx.query.id as string,
        workspaceId: dfContext.workspace.id,
      }),
    ]);
    if (!baseAppState || !channelState) {
      return {
        notFound: true,
      };
    }
    const appState: Partial<AppState> = {
      ...baseAppState,
      ...channelState,
    };

    console.log("appState", appState);
    return {
      props: addInitialStateToProps({
        serverInitialState: appState,
        props: {},
        dfContext,
      }),
    };
  });

export default function BroadcastConfigure() {
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
          sx={{
            height: "100%",
          }}
          key={id}
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
}
