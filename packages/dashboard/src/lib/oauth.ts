import { Static, Type } from "@sinclair/typebox";
import axios from "axios";
import backendConfig from "backend-lib/src/config";
import {
  EMAIL_EVENTS_UP_NAME,
  HUBSPOT_INTEGRATION,
  HUBSPOT_INTEGRATION_DEFINITION,
  HUBSPOT_OAUTH_TOKEN,
} from "backend-lib/src/constants";
import { insert, upsert } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { handleGmailCallback } from "backend-lib/src/gmail";
import { findEnrichedIntegration } from "backend-lib/src/integrations";
import { startHubspotIntegrationWorkflow } from "backend-lib/src/integrations/hubspot/signalUtils";
import { EMAIL_EVENTS_UP_DEFINITION } from "backend-lib/src/integrations/subscriptions";
import logger from "backend-lib/src/logger";
import {
  DBWorkspaceOccupantType,
  OauthFlow,
  OauthFlowEnum,
} from "backend-lib/src/types";
import { serialize } from "cookie";
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  jsonParseSafeWithSchema,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";
import { GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import { v4 as uuidv4 } from "uuid";

import { PropsWithInitialState } from "./types";

const CSRF_TOKEN_COOKIE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const OauthStateObject = Type.Object({
  csrf: Type.String(),
  returnTo: Type.Optional(Type.String()),
  workspaceId: Type.String(),
  // used for embedded auth
  token: Type.Optional(Type.String()),
  flow: Type.Optional(OauthFlow),
});

export type OauthStateObject = Static<typeof OauthStateObject>;

// Function to decode the state parameter
export function decodeAndValidateOauthState({
  stateParam,
  storedCsrfToken,
}: {
  stateParam?: string;
  storedCsrfToken?: string;
}): OauthStateObject | null {
  if (!stateParam || !storedCsrfToken) {
    logger().error(
      {
        stateParam,
        storedCsrfToken,
      },
      "missing state param or stored csrf token",
    );
    return null;
  }
  try {
    // Base64Url decode
    let base64 = stateParam.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonString = Buffer.from(base64, "base64").toString("utf-8");
    const decoded = jsonParseSafeWithSchema(jsonString, OauthStateObject);
    if (decoded.isErr()) {
      logger().error(
        {
          err: decoded.error,
          stateParam,
        },
        "error decoding state param",
      );
      return null;
    }
    const { value } = decoded;
    if (value.csrf !== storedCsrfToken) {
      logger().error(
        {
          value,
          storedCsrfToken,
        },
        "csrf token mismatch",
      );
      return null;
    }
    return value;
  } catch (error) {
    logger().error(
      { err: error, stateParam },
      "Error decoding Gmail OAuth state",
    );
    return null;
  }
}

interface OauthCallbackSuccessPopup {
  type: "success";
  flow: typeof OauthFlowEnum.PopUp;
}

interface OauthCallbackSuccessRedirect {
  type: "success";
  flow: typeof OauthFlowEnum.Redirect;
  redirectUrl: string;
}

type OauthCallbackSuccess =
  | OauthCallbackSuccessPopup
  | OauthCallbackSuccessRedirect;

interface OauthCallbackErrorPopup {
  type: "error";
  flow: typeof OauthFlowEnum.PopUp;
  reason: string;
}

interface OauthCallbackErrorRedirect {
  type: "error";
  flow: typeof OauthFlowEnum.Redirect;
  redirectUrl: string;
}

type OauthCallbackError = OauthCallbackErrorPopup | OauthCallbackErrorRedirect;

export async function handleOauthCallback({
  workspaceId,
  provider,
  code,
  occupantId,
  occupantType,
  returnTo,
  baseRedirectUri,
  flow = OauthFlowEnum.Redirect,
}: {
  workspaceId: string;
  provider?: string;
  code?: string;
  returnTo?: string;
  flow?: OauthFlow;
  occupantId: string;
  occupantType: DBWorkspaceOccupantType;
  baseRedirectUri: string;
}): Promise<Result<OauthCallbackSuccess, OauthCallbackError>> {
  if (!code) {
    switch (flow) {
      case OauthFlowEnum.PopUp:
        return err({
          flow,
          type: "error",
          reason: "missing_code",
        });
      case OauthFlowEnum.Redirect:
        return err({
          flow,
          type: "error",
          reason: "missing_code",
          redirectUrl: "/",
        });
      default:
        assertUnreachable(flow);
    }
  }
  const { dashboardUrl, hubspotClientSecret, hubspotClientId } =
    backendConfig();

  switch (provider) {
    case "gmail": {
      const redirectUri = `${dashboardUrl}${baseRedirectUri}/gmail`;
      // Get the state from the query parameters (returned by Google)
      const gmailResult = await handleGmailCallback({
        workspaceId,
        workspaceOccupantId: occupantId,
        workspaceOccupantType: occupantType,
        code,
        redirectUri,
      });
      if (gmailResult.isErr()) {
        logger().info(
          {
            err: gmailResult.error,
            workspaceId,
          },
          "failed to authorize gmail",
        );
      }

      if (flow === OauthFlowEnum.PopUp) {
        if (gmailResult.isOk()) {
          return ok({
            type: "success",
            actionType: "popup",
            flow,
          });
        }
        return err({
          type: "error",
          reason: "failed_to_authorize_gmail",
          flow,
        });
      }
      let baseRedirectPath = "/"; // Default to app's base path

      if (
        returnTo &&
        typeof returnTo === "string" && // Ensure it's a string
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//")
      ) {
        baseRedirectPath = returnTo;
      }

      const finalUrl = new URL(baseRedirectPath, dashboardUrl); // Use dashboardUrl to make it absolute for URL object manipulation

      if (gmailResult.isOk()) {
        finalUrl.searchParams.set("gmail_connected", "true");
      } else {
        finalUrl.searchParams.set("gmail_error", gmailResult.error.type);
      }

      const finalRedirectPath = finalUrl.pathname + finalUrl.search;
      return ok({
        type: "success",
        redirectUrl: finalRedirectPath,
        flow,
      });
      break;
    }
    case "hubspot": {
      logger().info(
        {
          workspaceId,
        },
        "handling hubspot callback",
      );

      if (!hubspotClientSecret) {
        throw new Error("missing hubspotClientSecret");
      }

      const formData = {
        grant_type: "authorization_code",
        client_id: hubspotClientId,
        client_secret: hubspotClientSecret,
        redirect_uri: `${dashboardUrl}/dashboard/oauth2/callback/hubspot`,
        code,
      };

      const [tokenResponse, integration] = await Promise.all([
        axios({
          method: "post",
          url: "https://api.hubapi.com/oauth/v1/token",
          data: formData,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
        findEnrichedIntegration({
          workspaceId,
          name: HUBSPOT_INTEGRATION,
        }).then(unwrap),
      ]);

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      await Promise.all([
        upsert({
          table: schema.oauthToken,
          values: {
            workspaceId,
            name: HUBSPOT_OAUTH_TOKEN,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
          },
          set: {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
          },
          target: [schema.oauthToken.workspaceId, schema.oauthToken.name],
        }).then(unwrap),
        upsert({
          table: schema.integration,
          values: {
            ...HUBSPOT_INTEGRATION_DEFINITION,
            workspaceId,
          },
          target: [schema.integration.workspaceId, schema.integration.name],
          set: {
            enabled: true,
            definition: integration
              ? {
                  ...integration.definition,
                  subscribedUserProperties:
                    HUBSPOT_INTEGRATION_DEFINITION.definition
                      .subscribedUserProperties,
                }
              : undefined,
          },
        }).then(unwrap),
        insert({
          table: schema.userProperty,
          values: {
            workspaceId,
            name: EMAIL_EVENTS_UP_NAME,
            definition: EMAIL_EVENTS_UP_DEFINITION,
            resourceType: "Internal",
          },
          doNothingOnConflict: true,
        }).then(unwrap),
      ]);
      await startHubspotIntegrationWorkflow({
        workspaceId,
      });
      return ok({
        type: "success",
        flow,
        redirectUrl: "/settings",
      });
    }
    default: {
      switch (flow) {
        case OauthFlowEnum.PopUp:
          return err({
            flow,
            type: "error",
            reason: "invalid_provider",
          });
        case OauthFlowEnum.Redirect:
          return err({
            flow,
            type: "error",
            reason: "invalid_provider",
            redirectUrl: "/",
          });
        default:
          assertUnreachable(flow);
      }
    }
  }
}

export const InitiateQuerySchema = Type.Omit(OauthStateObject, [
  "workspaceId",
  "csrf",
]);

export type InitiateQuery = Static<typeof InitiateQuerySchema>;

export function initiateGmailAuth({
  workspaceId,
  flow,
  returnTo,
  token,
  context,
}: {
  workspaceId: string;
  context: GetServerSidePropsContext;
} & InitiateQuery): GetServerSidePropsResult<PropsWithInitialState> {
  const { gmailClientId, dashboardUrl } = backendConfig();

  if (!gmailClientId) {
    logger().error("Missing gmailClientId in backend config.");
    return { redirect: { destination: "/", permanent: false } };
  }
  const csrf = uuidv4();

  const stateObjectToEncode: OauthStateObject = {
    csrf,
    workspaceId,
    flow: flow ?? OauthFlowEnum.Redirect,
    ...(returnTo && { returnTo }),
    ...(token && { token }),
  };

  logger().debug({ stateObjectToEncode }, "State object to encode");

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
}
