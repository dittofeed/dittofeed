import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import { and, eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";
import { validate as validateUuid } from "uuid";

import Broadcasts from "../../components/broadcast";
import DashboardContent from "../../components/dashboardContent";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const broadcastId = ctx.query.id;
    logger().debug(
      { broadcastId, params: ctx.params, query: ctx.query },
      "loc1 getServerSideProps",
    );
    if (typeof broadcastId !== "string") {
      logger().debug("loc1 getServerSideProps no id");
      return {
        notFound: true,
      };
    }
    if (!validateUuid(broadcastId)) {
      return {
        notFound: true,
      };
    }
    const broadcast = await db().query.broadcast.findFirst({
      where: and(
        eq(schema.broadcast.id, broadcastId),
        eq(schema.workspace.id, dfContext.workspace.id),
      ),
    });
    logger().debug({ broadcastId, broadcast }, "loc2 getServerSideProps");
    if (!broadcast) {
      return {
        notFound: true,
      };
    }
    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
      }),
    };
  });

function BroadcastPageContent() {
  const router = useRouter();
  const queryParams = router.query;
  return <Broadcasts queryParams={queryParams} />;
}

export default function BroadcastPage() {
  const router = useRouter();
  return (
    <DashboardContent>
      {router.isReady && <BroadcastPageContent />}
    </DashboardContent>
  );
}
