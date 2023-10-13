import { Button, Stack, Typography } from "@mui/material";
import { getOrCreateBroadcast } from "backend-lib/src/broadcasts";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import prisma from "backend-lib/src/prisma";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { findAllUserTraits } from "backend-lib/src/userEvents";
import { SegmentResource } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDebounce } from "use-debounce";
import { validate } from "uuid";

import { SegmentEditorInner } from "../../../components/segmentEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../../lib/appStore";
import { requestContext } from "../../../lib/requestContext";
import { getSegmentConfigState } from "../../../lib/segments";
import { AppState, PropsWithInitialState } from "../../../lib/types";
import { useUpdateEffect } from "../../../lib/useUpdateEffect";
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
    const [
      { broadcast, segment },
      traits,
      subscriptionGroups,
      messageTemplates,
    ] = await Promise.all([
      getOrCreateBroadcast({
        workspaceId: dfContext.workspace.id,
        broadcastId: id,
      }),
      findAllUserTraits({
        workspaceId,
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

    const baseAppState = getBroadcastAppState({ broadcast });
    const segmentAppState = getSegmentConfigState({
      segment,
      traits,
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

export default function BroadcastSegment() {
  const router = useRouter();
  const {
    segmentUpdateRequest,
    setSegmentUpdateRequest,
    upsertSegment,
    editedSegment,
    apiBase,
  } = useAppStorePick([
    "segmentUpdateRequest",
    "setSegmentUpdateRequest",
    "upsertSegment",
    "editedSegment",
    "apiBase",
  ]);
  const { id } = router.query;
  const [debouncedSegment] = useDebounce(editedSegment, 1000);

  useUpdateEffect(() => {
    if (!debouncedSegment) {
      return;
    }
    apiRequestHandlerFactory({
      request: segmentUpdateRequest,
      setRequest: setSegmentUpdateRequest,
      responseSchema: SegmentResource,
      setResponse: upsertSegment,
      onSuccessNotice: `Saved broadcast segment`,
      onFailureNoticeHandler: () =>
        `API Error: Failed to save broadcast segment`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/segments`,
        data: debouncedSegment,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Don't want to re-render on segmentUpdateRequest updating.
    apiBase,
    debouncedSegment,
    setSegmentUpdateRequest,
    upsertSegment,
  ]);

  if (typeof id !== "string" || !editedSegment) {
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
      <SegmentEditorInner
        sx={{ width: "100%" }}
        editedSegment={editedSegment}
      />
    </BroadcastLayout>
  );
}
