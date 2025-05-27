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
import { DBWorkspaceOccupantType } from "backend-lib/src/types";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok, Result } from "neverthrow";

interface OauthCallbackSuccess {
  type: "success";
  redirectUrl: string;
}

interface OauthCallbackError {
  type: "error";
  reason: string;
  redirectUrl: string;
}

interface DecodedGmailState {
  csrf?: string;
  returnTo?: string;
}

// Function to decode the state parameter
function decodeGmailState(
  stateParam: string | undefined,
): DecodedGmailState | null {
  if (!stateParam) {
    return null;
  }
  try {
    // Base64Url decode
    let base64 = stateParam.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonString = atob(base64); // atob is available in Node.js via global or Buffer
    const decoded = JSON.parse(jsonString) as DecodedGmailState;
    // Basic validation of the decoded object structure
    if (typeof decoded.csrf === "string") {
      return decoded;
    }
    return null;
  } catch (error) {
    logger().error(
      { err: error, stateParam },
      "Error decoding Gmail OAuth state",
    );
    return null;
  }
}

export async function handleOauthCallback({
  workspaceId,
  provider,
  code,
  state,
  storedCsrfToken,
  occupantId,
  occupantType,
}: {
  workspaceId: string;
  provider?: string;
  code?: string;
  state?: string;
  storedCsrfToken?: string;
  occupantId: string;
  occupantType: DBWorkspaceOccupantType;
}): Promise<Result<OauthCallbackSuccess, OauthCallbackError>> {
  const { dashboardUrl, hubspotClientSecret, hubspotClientId, signoutUrl } =
    backendConfig();

  if (typeof code !== "string" || typeof provider !== "string") {
    logger().error("malformed callback url");
    return err({
      type: "error",
      reason: "malformed_callback_url",
      redirectUrl: "/",
    });
  }

  switch (provider) {
    case "gmail": {
      // Decode the state parameter
      const decodedState = decodeGmailState(state);

      // Validate the state parameter
      if (
        !decodedState?.csrf ||
        !storedCsrfToken ||
        decodedState.csrf !== storedCsrfToken
      ) {
        logger().error(
          {
            workspaceId,
            provider: "gmail",
            returnedStateParam: state,
            decodedCsrf: decodedState?.csrf,
            storedCsrf: storedCsrfToken,
          },
          "Invalid OAuth state - possible CSRF attack or decoding issue",
        );

        if (!signoutUrl) {
          return err({
            type: "error",
            reason: "invalid_oauth_state",
            redirectUrl: "/",
          });
        }
        return err({
          type: "error",
          reason: "invalid_oauth_state",
          redirectUrl: signoutUrl,
        });
      }

      logger().info(
        {
          workspaceId,
        },
        "handling gmail callback - state validated",
      );
      const redirectUri = `${dashboardUrl}/dashboard/oauth2/callback/gmail`;

      // Handle Gmail callback asynchronously
      const gmailResult = await handleGmailCallback({
        workspaceId,
        workspaceOccupantId: occupantId,
        workspaceOccupantType: occupantType,
        code,
        originalState: storedCsrfToken,
        returnedState: decodedState.csrf,
        redirectUri,
      });

      let baseRedirectPath = "/"; // Default to app's base path

      // Validate and use the returnTo path from the decoded state if valid
      if (
        decodedState.returnTo &&
        typeof decodedState.returnTo === "string" && // Ensure it's a string
        decodedState.returnTo.startsWith("/") &&
        !decodedState.returnTo.startsWith("//")
      ) {
        baseRedirectPath = decodedState.returnTo;
      }

      const finalUrl = new URL(baseRedirectPath, dashboardUrl);

      if (gmailResult.isOk()) {
        finalUrl.searchParams.set("gmail_connected", "true");
      } else {
        logger().error(
          {
            err: gmailResult.error,
            workspaceId,
          },
          "failed to authorize gmail",
        );
        finalUrl.searchParams.set("gmail_error", gmailResult.error.type);
      }

      const finalRedirectPath = finalUrl.pathname + finalUrl.search;

      return ok({
        type: "success",
        redirectUrl: finalRedirectPath,
      });
    }
    case "hubspot": {
      logger().info(
        {
          workspaceId,
        },
        "handling hubspot callback",
      );

      if (!hubspotClientSecret) {
        return err({
          type: "error",
          reason: "missing_hubspot_client_secret",
          redirectUrl: "/",
        });
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
              : HUBSPOT_INTEGRATION_DEFINITION.definition,
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
        redirectUrl: "/",
      });
    }
    default:
      logger().error(
        {
          provider,
        },
        "unknown provider",
      );

      return err({
        type: "error",
        reason: "unknown_provider",
        redirectUrl: "/",
      });
  }
}
