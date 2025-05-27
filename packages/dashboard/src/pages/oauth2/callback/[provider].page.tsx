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
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { GetServerSideProps, GetServerSidePropsContext } from "next";

import { requestContext } from "../../../lib/requestContext";

// pull out gmail_oauth_state value from request context
function getGmailOauthState(
  ctx: GetServerSidePropsContext,
): string | undefined {
  // Get cookies from the request
  const cookies = ctx.req.cookies ?? {};
  return cookies.gmail_oauth_state;
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

export const getServerSideProps: GetServerSideProps = requestContext(
  async (ctx, dfContext) => {
    const { code, provider } = ctx.query;
    if (typeof code !== "string" || typeof provider !== "string") {
      logger().error("malformed callback url");

      return {
        redirect: {
          permanent: false,
          destination: "/",
        },
      };
    }

    const { dashboardUrl, hubspotClientSecret, hubspotClientId } =
      backendConfig();

    switch (provider) {
      case "gmail": {
        // Get the state from the query parameters (returned by Google)
        const returnedStateParam = ctx.query.state as string | undefined;

        // Decode the state parameter
        const decodedState = decodeGmailState(returnedStateParam);

        // Get the stored CSRF token from the cookie
        const storedCsrfToken = getGmailOauthState(ctx);

        // Validate the state parameter
        if (
          !decodedState?.csrf ||
          !storedCsrfToken ||
          decodedState.csrf !== storedCsrfToken
        ) {
          logger().error(
            {
              workspaceId: dfContext.workspace.id,
              provider: "gmail",
              returnedStateParam,
              decodedCsrf: decodedState?.csrf,
              storedCsrf: storedCsrfToken,
            },
            "Invalid OAuth state - possible CSRF attack or decoding issue",
          );

          const { signoutUrl } = backendConfig(); // Only get signoutUrl if dashboardUrl isn't needed here
          if (!signoutUrl) {
            return {
              notFound: true,
            };
          }
          return {
            redirect: {
              permanent: false,
              destination: signoutUrl,
            },
          };
        }

        logger().info(
          {
            workspaceId: dfContext.workspace.id,
          },
          "handling gmail callback - state validated",
        );
        const redirectUri = `${dashboardUrl}/dashboard/oauth2/callback/gmail`;
        const gmailResult = await handleGmailCallback({
          workspaceId: dfContext.workspace.id,
          workspaceOccupantId: dfContext.member.id,
          workspaceOccupantType: "WorkspaceMember",
          code,
          originalState: storedCsrfToken,
          returnedState: decodedState.csrf,
          redirectUri,
        });
        if (gmailResult.isErr()) {
          logger().error(
            {
              err: gmailResult.error,
              workspaceId: dfContext.workspace.id,
            },
            "failed to authorize gmail",
          );
        }

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

        const finalUrl = new URL(baseRedirectPath, dashboardUrl); // Use dashboardUrl to make it absolute for URL object manipulation

        if (gmailResult.isOk()) {
          finalUrl.searchParams.set("gmail_connected", "true");
        } else {
          finalUrl.searchParams.set("gmail_error", gmailResult.error.type);
        }

        const finalRedirectPath = finalUrl.pathname + finalUrl.search;

        return {
          redirect: {
            permanent: false,
            destination: finalRedirectPath,
          },
        };
      }
      case "hubspot": {
        logger().info(
          {
            workspaceId: dfContext.workspace.id,
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
            workspaceId: dfContext.workspace.id,
            name: HUBSPOT_INTEGRATION,
          }).then(unwrap),
        ]);

        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        await Promise.all([
          upsert({
            table: schema.oauthToken,
            values: {
              workspaceId: dfContext.workspace.id,
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
              workspaceId: dfContext.workspace.id,
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
              workspaceId: dfContext.workspace.id,
              name: EMAIL_EVENTS_UP_NAME,
              definition: EMAIL_EVENTS_UP_DEFINITION,
              resourceType: "Internal",
            },
            doNothingOnConflict: true,
          }).then(unwrap),
        ]);
        await startHubspotIntegrationWorkflow({
          workspaceId: dfContext.workspace.id,
        });
        break;
      }
      default:
        logger().error(
          {
            provider,
          },
          "unknown provider",
        );

        return {
          redirect: {
            permanent: false,
            destination: "/",
          },
        };
    }
    return {
      redirect: {
        permanent: false,
        destination: "/",
      },
    };
  },
);

export default function CallbackPage() {
  throw new Error("CallbackPage should never be rendered");
}
