import { Button, Stack, Typography, useTheme } from "@mui/material";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";

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
    <BroadcastLayout activeStep="configure" id={id}>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "center",
        }}
      >
        <Typography
          fontWeight={400}
          variant="h2"
          sx={{ fontSize: 16, marginBottom: 0.5 }}
        >
          Configure Broadcast
        </Typography>
        <Button LinkComponent={Link} href={`/broadcasts/template/${id}`}>
          Next
        </Button>
      </Stack>
      <EditableName
        variant="h6"
        sx={{
          minWidth: theme.spacing(52),
        }}
        name={editedBroadcast.name}
        disabled={!editable}
        onChange={(e) => updateEditedBroadcast({ name: e.target.value })}
      />
    </BroadcastLayout>
  );
}
