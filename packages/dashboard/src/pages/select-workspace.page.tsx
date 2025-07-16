import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
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

  try {
    // Try to parse as a complete URL first
    const url = new URL(redirectTo);
    // If it's a complete URL, extract just the pathname
    return url.pathname || defaultPath;
  } catch {
    // Not a complete URL, treat as a path
    try {
      // Parse as a path with dummy origin to validate structure
      const url = new URL(redirectTo, "http://localhost");
      return url.pathname || defaultPath;
    } catch (e) {
      logger().error({ err: e, redirectTo }, "invalid redirectTo");
      // Invalid path structure
      return defaultPath;
    }
  }
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
