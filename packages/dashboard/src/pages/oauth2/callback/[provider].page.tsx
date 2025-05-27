import logger from "backend-lib/src/logger";
import { GetServerSideProps } from "next";

import { handleOauthCallback } from "../../../lib/oauth";
import { requestContext } from "../../../lib/requestContext";

// FIXME implement embedded version of page, but exclude from embedded auth
export const getServerSideProps: GetServerSideProps = requestContext(
  async (ctx, dfContext) => {
    const { code, provider, state } = ctx.query;
    if (
      typeof code !== "string" ||
      typeof provider !== "string" ||
      (state && typeof state !== "string")
    ) {
      return {
        redirect: {
          permanent: false,
          destination: "/",
        },
      };
    }
    const callbackResult = await handleOauthCallback({
      workspaceId: dfContext.workspace.id,
      provider,
      code,
      state,
      occupantId: dfContext.member.id,
      occupantType: "WorkspaceMember",
    });

    if (callbackResult.isErr()) {
      logger().error(
        {
          err: callbackResult.error,
          workspaceId: dfContext.workspace.id,
        },
        "failed to handle oauth callback",
      );
      return {
        redirect: {
          permanent: false,
          destination: callbackResult.error.redirectUrl,
        },
      };
    }
    return {
      redirect: {
        permanent: false,
        destination: callbackResult.value.redirectUrl,
      },
    };
  },
);

export default function CallbackPage() {
  throw new Error("CallbackPage should never be rendered");
}
