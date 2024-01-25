import axios from "axios";
import backendConfig from "backend-lib/src/config";
import {
  EMAIL_EVENTS_UP_NAME,
  HUBSPOT_INTEGRATION,
  HUBSPOT_INTEGRATION_DEFINITION,
  HUBSPOT_OAUTH_TOKEN,
} from "backend-lib/src/constants";
import { findEnrichedIntegration } from "backend-lib/src/integrations";
import { startHubspotIntegrationWorkflow } from "backend-lib/src/integrations/hubspot/signalUtils";
import { EMAIL_EVENTS_UP_DEFINITION } from "backend-lib/src/integrations/subscriptions";
import logger from "backend-lib/src/logger";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { GetServerSideProps } from "next";

import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";

export const getServerSideProps: GetServerSideProps = requestContext(
  async (ctx, dfContext) => {
    const { code, provider } = ctx.query;
    if (typeof code !== "string" || typeof provider !== "string") {
      logger().error("malformed callback url");

      return {
        redirect: {
          permanent: false,
          destination: "/settings",
        },
      };
    }

    const { dashboardUrl, hubspotClientSecret, hubspotClientId } =
      backendConfig();

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

    switch (provider) {
      case "hubspot": {
        logger().info(
          {
            workspaceId: dfContext.workspace.id,
          },
          "handling hubspot callback",
        );
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
          prisma().oauthToken.upsert({
            where: {
              workspaceId_name: {
                workspaceId: dfContext.workspace.id,
                name: HUBSPOT_OAUTH_TOKEN,
              },
            },
            create: {
              workspaceId: dfContext.workspace.id,
              name: HUBSPOT_OAUTH_TOKEN,
              accessToken: access_token,
              refreshToken: refresh_token,
              expiresIn: expires_in,
            },
            update: {
              accessToken: access_token,
              refreshToken: refresh_token,
              expiresIn: expires_in,
            },
          }),
          prisma().integration.upsert({
            where: {
              workspaceId_name: {
                workspaceId: dfContext.workspace.id,
                name: HUBSPOT_INTEGRATION,
              },
            },
            create: {
              ...HUBSPOT_INTEGRATION_DEFINITION,
              workspaceId: dfContext.workspace.id,
            },
            update: {
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
          }),
          prisma().userProperty.upsert({
            where: {
              workspaceId_name: {
                workspaceId: dfContext.workspace.id,
                name: EMAIL_EVENTS_UP_NAME,
              },
            },
            create: {
              workspaceId: dfContext.workspace.id,
              name: EMAIL_EVENTS_UP_NAME,
              definition: EMAIL_EVENTS_UP_DEFINITION,
              resourceType: "Internal",
            },
            update: {},
          }),
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
            destination: "/settings",
          },
        };
    }
    return {
      redirect: {
        permanent: false,
        destination: "/settings",
      },
    };
  },
);

export default function CallbackPage() {
  throw new Error("CallbackPage should never be rendered");
}
