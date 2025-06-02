import logger from "backend-lib/src/logger";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import type { GetServerSideProps } from "next";

import { initiateGmailAuth, InitiateQuerySchema } from "../../../lib/oauth";
import { requestContext } from "../../../lib/requestContext";

export const getServerSideProps: GetServerSideProps = requestContext(
  async (context, dfContext) => {
    const { query } = context;

    const validatedQuery = schemaValidateWithErr(query, InitiateQuerySchema);

    if (validatedQuery.isErr()) {
      logger().error(
        {
          query,
          error: validatedQuery.error.message,
        },
        "Invalid query parameters for OAuth initiation.",
      );
      return { redirect: { destination: "/", permanent: false } };
    }

    return initiateGmailAuth({
      workspaceId: dfContext.workspace.id,
      context,
      finalCallbackPath: "/dashboard/oauth2/callback/gmail",
      ...validatedQuery.value,
    }).unwrapOr({ redirect: { destination: "/", permanent: false } });
  },
);

export default function InitiateGmailAuthPage(): null {
  return null;
}
