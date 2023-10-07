import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  useTheme,
} from "@mui/material";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { ChannelType } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import EditableName from "../../../components/editableName";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";
import { BroadcastLayout } from "../broadcastLayout";
import { getBroadcastAppState } from "../getBroadcastAppState";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const appState = await getBroadcastAppState({
      ctx,
      workspaceId: dfContext.workspace.id,
    });
    if (!appState) {
      return {
        notFound: true,
      };
    }

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
  const { id } = router.query;
  const [channel, setChannel] = useState<ChannelType>(ChannelType.Email);

  const { editedBroadcast, updateEditedBroadcast } = useAppStorePick([
    "editedBroadcast",
    "updateEditedBroadcast",
  ]);
  const editable = editedBroadcast?.triggeredAt === undefined;
  const theme = useTheme();

  if (typeof id !== "string" || !editedBroadcast) {
    return null;
  }
  return (
    <BroadcastLayout activeStep="configure" editable={false} id={id}>
      <Typography
        fontWeight={400}
        variant="h2"
        sx={{ fontSize: 16, marginBottom: 0.5 }}
      >
        Configure Broadcast
      </Typography>

      <EditableName
        variant="h6"
        sx={{
          minWidth: theme.spacing(52),
        }}
        name={editedBroadcast.name}
        disabled={!editable}
        onChange={(e) => updateEditedBroadcast({ name: e.target.value })}
      />
      <FormControl>
        <InputLabel id="broadcast-channel-label">Channel</InputLabel>
        <Select
          label="Channel"
          labelId="broadcast-channel-label"
          sx={{
            minWidth: theme.spacing(10),
          }}
          onChange={(e) => {
            setChannel(e.target.value as ChannelType);
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
      <Button>Next</Button>
    </BroadcastLayout>
  );
}
