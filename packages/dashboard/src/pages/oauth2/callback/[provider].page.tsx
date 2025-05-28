import logger from "backend-lib/src/logger";
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import { GetServerSideProps } from "next";

import {
  decodeAndValidateOauthState,
  handleOauthCallback,
} from "../../../lib/oauth";
import { requestContext } from "../../../lib/requestContext";

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
    const validatedState = decodeAndValidateOauthState({
      stateParam: state,
      storedCsrfToken: ctx.req.cookies[OAUTH_COOKIE_NAME],
    });
    // allow hubspot to be called without a state param for backwards compatibility
    if (!validatedState && provider !== "hubspot") {
      logger().error(
        {
          provider,
          state,
        },
        "invalid state param",
      );
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
      returnTo: validatedState?.returnTo,
      occupantId: dfContext.member.id,
      occupantType: "WorkspaceMember",
      baseRedirectUri: "/dashboard/oauth2/callback",
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
