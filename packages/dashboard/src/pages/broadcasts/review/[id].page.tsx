import { LoadingButton } from "@mui/lab";
import { Tooltip, Typography } from "@mui/material";
import { getOrCreateBroadcast } from "backend-lib/src/broadcasts";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import prisma from "backend-lib/src/prisma";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import {
  BroadcastResource,
  CompletionStatus,
  TriggerBroadcastRequest,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { validate } from "uuid";

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

    const workspaceId = dfContext.workspace.id;
    const [{ broadcast, segment }, subscriptionGroups, messageTemplates] =
      await Promise.all([
        getOrCreateBroadcast({
          workspaceId: dfContext.workspace.id,
          broadcastId: id,
        }),
        prisma().subscriptionGroup.findMany({
          where: {
            workspaceId,
          },
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
        subscriptionGroupToResource(sg)
      ),
      messageTemplates,
    });

    const appState: Partial<AppState> = {
      ...baseAppState,
      ...segmentAppState,
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
  const editable = persistedBroadcast?.status === "NotStarted";
  const triggerDisabled =
    !editable || broadcastTriggerRequest.type === CompletionStatus.InProgress;

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
      <Tooltip title={!editable ? "Broadcast has already been triggered" : ""}>
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
    </BroadcastLayout>
  );
}
