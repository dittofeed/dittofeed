import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

function getValidatedRedirectPath(redirectTo: unknown): string {
  // Default destination
  const defaultPath = "/";

  // Must be a string
  if (typeof redirectTo !== "string") {
    return defaultPath;
  }

  // Must start with "/" to prevent external redirects
  if (!redirectTo.startsWith("/")) {
    return defaultPath;
  }

  // Must not contain protocol or domain (additional security)
  if (redirectTo.includes("://") || redirectTo.includes("//")) {
    return defaultPath;
  }

  // Return the validated path
  return redirectTo;
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const { workspaceId, redirectTo } = ctx.query;

    if (typeof workspaceId !== "string" || !validate(workspaceId)) {
      return {
        redirect: {
          permanent: false,
          destination: getValidatedRedirectPath(redirectTo),
        },
      };
    }

    await db()
      .update(schema.workspaceMember)
      .set({
        lastWorkspaceId: workspaceId,
      })
      .where(eq(schema.workspaceMember.id, dfContext.member.id));

    return {
      redirect: {
        permanent: false,
        destination: getValidatedRedirectPath(redirectTo),
      },
    };
  });

export default function Empty() {
  return null;
}
