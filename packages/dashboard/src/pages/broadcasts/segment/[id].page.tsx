import { Button, Stack, Typography } from "@mui/material";
import { getOrCreateBroadcast } from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { eq } from "drizzle-orm";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useDebouncedCallback } from "use-debounce";
import { validate } from "uuid";

import SegmentEditor, {
  SegmentEditorProps,
} from "../../../components/segmentEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
import { requestContext } from "../../../lib/requestContext";
import { getSegmentConfigState } from "../../../lib/segments";
import { AppState, PropsWithInitialState } from "../../../lib/types";
import { useUpdateSegmentsMutation } from "../../../lib/useUpdateSegmentsMutation";
import { BroadcastLayout } from "../broadcastLayout";
import { getBroadcastAppState } from "../getBroadcastAppState";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
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

    const workspaceId = dfContext.workspace.id;
    const [
      { broadcast, segment, messageTemplate, journey },
      subscriptionGroups,
      messageTemplates,
    ] = await Promise.all([
      getOrCreateBroadcast({
        workspaceId: dfContext.workspace.id,
        broadcastId: id,
        name,
      }),
      db().query.subscriptionGroup.findMany({
        where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
      }),
      findMessageTemplates({
        workspaceId,
      }),
    ]);
    if (broadcast.workspaceId !== workspaceId) {
      return {
        notFound: true,
      };
    }

    const baseAppState = getBroadcastAppState({ broadcast });
    const segmentAppState = getSegmentConfigState({
      subscriptionGroups: subscriptionGroups.map((sg) =>
        subscriptionGroupToResource(sg),
      ),
      messageTemplates,
    });

    const appState: Partial<AppState> = {
      ...baseAppState,
      ...segmentAppState,
      messages: {
        type: CompletionStatus.Successful,
        value: [messageTemplate],
      },
      segments: {
        type: CompletionStatus.Successful,
        value: [segment],
      },
      journeys: {
        type: CompletionStatus.Successful,
        value: [journey],
      },
    };

    return {
      props: addInitialStateToProps({
        serverInitialState: appState,
        props: {},
        dfContext,
      }),
    };
  });

export default function BroadcastSegment() {
  const router = useRouter();
  const { broadcasts } = useAppStorePick([
    "broadcasts",
    "upsertSegment",
    "apiBase",
  ]);
  const { id } = router.query;
  const broadcast = useMemo(
    () => broadcasts.find((b) => b.id === id) ?? null,
    [broadcasts, id],
  );
  const segmentsUpdateMutation = useUpdateSegmentsMutation();
  const started = broadcast?.status !== "NotStarted";

  const updateSegmentCallback: SegmentEditorProps["onSegmentChange"] =
    useDebouncedCallback((s) => {
      segmentsUpdateMutation.mutate({
        id: s.id,
        definition: s.definition,
        name: s.name,
      });
    }, 1000);

  if (typeof id !== "string") {
    return null;
  }

  return (
    <BroadcastLayout activeStep="segment" id={id}>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "center",
        }}
      >
        <Typography fontWeight={400} variant="h2" sx={{ fontSize: 16 }}>
          Broadcast Segment
        </Typography>
        <Button LinkComponent={Link} href={`/broadcasts/template/${id}`}>
          Next
        </Button>
      </Stack>
      {broadcast?.segmentId && (
        <SegmentEditor
          sx={{ width: "100%" }}
          disabled={started}
          segmentId={broadcast.segmentId}
          onSegmentChange={updateSegmentCallback}
        />
      )}
    </BroadcastLayout>
  );
}
