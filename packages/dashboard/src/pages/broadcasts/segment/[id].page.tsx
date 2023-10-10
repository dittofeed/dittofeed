import { Box, Button, Stack, Typography } from "@mui/material";
import { getOrCreateBroadcast } from "backend-lib/src/broadcasts";
import { GetServerSideProps, NextPage } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { getSegmentConfigState } from "../../../lib/segments";
import { AppState, PropsWithInitialState } from "../../../lib/types";
import { BroadcastLayout } from "../broadcastLayout";
import { getBroadcastAppState } from "../getBroadcastAppState";

interface BroadcastSegmentProps {
  segmentId: string;
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<BroadcastSegmentProps>
> = requestContext(async (ctx, dfContext) => {
  const id = ctx.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }

  const { broadcast, segment } = await getOrCreateBroadcast({
    workspaceId: dfContext.workspace.id,
    broadcastId: id,
  });

  const baseAppState = getBroadcastAppState({ broadcast });
  // const segmentAppState = getSegmentConfigState({ segment });

  const appState: Partial<AppState> = {
    ...baseAppState,
  };

  return {
    props: addInitialStateToProps({
      serverInitialState: appState,
      props: {
        segmentId: segment.id,
      },
      dfContext,
    }),
  };
});

const BroadcastConfigure: NextPage<BroadcastSegmentProps> =
  function BroadcastConfigure({ segmentId }) {
    const router = useRouter();
    const { id } = router.query;

    if (typeof id !== "string") {
      return null;
    }
    let templateEditor;

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
            Broadcast Segment
          </Typography>
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
