import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { serialize } from "cookie";
import { and, eq } from "drizzle-orm";
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";
import { v4 as uuidv4, validate as validateUuid } from "uuid";

import Broadcast from "../../components/broadcast";
import DashboardContent from "../../components/dashboardContent";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const broadcastId = ctx.query.id;
    if (typeof broadcastId !== "string") {
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
        eq(schema.broadcast.workspaceId, dfContext.workspace.id),
      ),
    });
    if (!broadcast) {
      return {
        notFound: true,
      };
    }
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      expires: new Date(expiresAt),
    };
    const csrfToken = uuidv4();
    // allow broadcasts to initiate oauth flow
    const cookieString = serialize(OAUTH_COOKIE_NAME, csrfToken, cookieOptions);
    ctx.res.setHeader("Set-Cookie", cookieString);

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
  return (
    <Broadcast
      queryParams={queryParams}
      sx={{
        pt: 2,
        px: 1,
        pb: 1,
        width: "100%",
        height: "100%",
      }}
    />
  );
}

export default function BroadcastPage() {
  const router = useRouter();
  return (
    <DashboardContent>
      {router.isReady && <BroadcastPageContent />}
    </DashboardContent>
  );
}
