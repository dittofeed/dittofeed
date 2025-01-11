import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

const REDIRECT_TARGET = {
  redirect: {
    permanent: false,
    destination: "/",
  },
} as const;

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const { workspaceId } = ctx.query;

    if (typeof workspaceId !== "string" || !validate(workspaceId)) {
      return REDIRECT_TARGET;
    }
    await db()
      .update(schema.workspaceMember)
      .set({
        lastWorkspaceId: workspaceId,
      })
      .where(eq(schema.workspaceMember.id, dfContext.member.id));

    return REDIRECT_TARGET;
  });

export default function Empty() {
  return null;
}
