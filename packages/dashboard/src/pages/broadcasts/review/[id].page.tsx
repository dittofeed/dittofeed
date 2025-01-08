import { LoadingButton } from "@mui/lab";
import { Stack, Tooltip, Typography } from "@mui/material";
import { getOrCreateBroadcast } from "backend-lib/src/broadcasts";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { eq } from "drizzle-orm";
import {
  BroadcastResource,
  CompletionStatus,
  TriggerBroadcastRequest,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { validate } from "uuid";

import { DeliveriesTable } from "../../../components/deliveriesTable";
import { SubtleHeader } from "../../../components/headers";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../../lib/appStore";
import { requestContext } from "../../../lib/requestContext";
import { getSegmentConfigState } from "../../../lib/segments";
import { AppState, PropsWithInitialState } from "../../../lib/types";
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
      { broadcast, segment, journey, messageTemplate },
      subscriptionGroups,
      messageTemplates,
    ] = await Promise.all([
      getOrCreateBroadcast({
        workspaceId: dfContext.workspace.id,
        name,
        broadcastId: id,
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
      segment,
      segmentId: id,
      workspaceId,
      subscriptionGroups: subscriptionGroups.map((sg) =>
        subscriptionGroupToResource(sg),
      ),
      messageTemplates,
    });

    const appState: Partial<AppState> = {
      ...baseAppState,
      ...segmentAppState,
      journeys: {
        type: CompletionStatus.Successful,
        value: [journey],
      },
      messages: {
        type: CompletionStatus.Successful,
        value: [messageTemplate],
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

export default function BroadcastReview() {
  const router = useRouter();
  const { id } = router.query;
  const {
    editedBroadcast,
    broadcastTriggerRequest,
    setBroadcastTriggerRequest,
    apiBase,
    broadcasts,
    upsertBroadcast,
  } = useAppStorePick([
    "apiBase",
    "editedBroadcast",
    "broadcasts",
    "broadcastTriggerRequest",
    "setBroadcastTriggerRequest",
    "upsertBroadcast",
  ]);

  const persistedBroadcast = broadcasts.find((b) => b.id === id);
  const notStarted = persistedBroadcast?.status === "NotStarted";
  const triggerDisabled =
    !notStarted || broadcastTriggerRequest.type === CompletionStatus.InProgress;

  if (typeof id !== "string" || !editedBroadcast) {
    return null;
  }
  const triggerPayload: TriggerBroadcastRequest = {
    workspaceId: editedBroadcast.workspaceId,
    id: editedBroadcast.id,
  };

  const handleTrigger = apiRequestHandlerFactory({
    request: broadcastTriggerRequest,
    setRequest: setBroadcastTriggerRequest,
    responseSchema: BroadcastResource,
    setResponse: upsertBroadcast,
    onSuccessNotice: `Triggered broadcast`,
    onFailureNoticeHandler: () => `API Error: Failed to trigger broadcast`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/broadcasts/trigger`,
      data: triggerPayload,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  return (
    <BroadcastLayout activeStep="review" id={id}>
      <Typography fontWeight={400} variant="h2" sx={{ fontSize: 16 }}>
        Broadcast Review
      </Typography>
      <Stack spacing={2} sx={{ width: "100%" }}>
        <Tooltip
          title={!notStarted ? "Broadcast has already been triggered" : ""}
        >
          <span>
            <LoadingButton
              loading={
                broadcastTriggerRequest.type === CompletionStatus.InProgress
              }
              disabled={triggerDisabled}
              variant="contained"
              onClick={handleTrigger}
            >
              Trigger Broadcast
            </LoadingButton>
          </span>
        </Tooltip>
        {!notStarted && (
          <Stack sx={{ flex: 1 }} spacing={1}>
            <SubtleHeader>Deliveries</SubtleHeader>
            <DeliveriesTable journeyId={persistedBroadcast?.journeyId} />
          </Stack>
        )}
      </Stack>
    </BroadcastLayout>
  );
}
