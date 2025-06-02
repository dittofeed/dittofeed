import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { OauthFlowEnum } from "backend-lib/src/types";
import { serialize } from "cookie";
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import type { GetServerSideProps } from "next";

import { OauthStateObject } from "../../../lib/oauth";

const CSRF_TOKEN_COOKIE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { query } = context;
  const { gmailClientId, dashboardUrl } = backendConfig();

  if (!gmailClientId) {
    logger().error("Missing gmailClientId in backend config.");
    return { redirect: { destination: "/", permanent: false } };
  }

  const validatedQuery = schemaValidateWithErr(query, OauthStateObject);

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

  const { csrf, workspaceId, flow, returnTo, token } = validatedQuery.value;

  const stateObjectToEncode: OauthStateObject = {
    csrf,
    workspaceId,
    flow: flow ?? OauthFlowEnum.Redirect,
    ...(returnTo && { returnTo }),
    ...(token && { token }),
  };

  const cookieExpiry = new Date(Date.now() + CSRF_TOKEN_COOKIE_EXPIRY_MS);
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires: cookieExpiry,
  };
  const cookieString = serialize(OAUTH_COOKIE_NAME, csrf, cookieOptions);
  context.res.setHeader("Set-Cookie", cookieString);

  let stateParamForGoogle;
  try {
    const finalStateValidation = schemaValidateWithErr(
      stateObjectToEncode,
      OauthStateObject,
    );
    if (finalStateValidation.isErr()) {
      logger().error(
        { err: finalStateValidation.error, state: stateObjectToEncode },
        "Constructed OauthStateObject is invalid",
      );
      return { redirect: { destination: "/", permanent: false } };
    }
    const jsonString = JSON.stringify(finalStateValidation.value);
    stateParamForGoogle = Buffer.from(jsonString).toString("base64url");
  } catch (error) {
    logger().error(
      { err: error, stateObject: stateObjectToEncode },
      "Failed to stringify or encode OAuth state object.",
    );
    return { redirect: { destination: "/", permanent: false } };
  }

  const finalCallbackPath = `/dashboard/oauth2/callback/gmail`;
  const googleRedirectUri = dashboardUrl.endsWith("/")
    ? `${dashboardUrl.slice(0, -1)}${finalCallbackPath}`
    : `${dashboardUrl}${finalCallbackPath}`;

  const params = new URLSearchParams({
    client_id: gmailClientId,
    redirect_uri: googleRedirectUri,
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    state: stateParamForGoogle,
    access_type: "offline",
    prompt: "consent",
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return {
    redirect: {
      destination: googleAuthUrl,
      permanent: false,
    },
  };
};

export default function InitiateGmailAuthPage(): null {
  return null;
}
