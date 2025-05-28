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
import { DBWorkspaceOccupantType } from "backend-lib/src/types";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok, Result } from "neverthrow";

export const OauthStateObject = Type.Object({
  csrf: Type.String(),
  returnTo: Type.Optional(Type.String()),
  workspaceId: Type.String(),
  token: Type.Optional(Type.String()),
});

export type OauthStateObject = Static<typeof OauthStateObject>;

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
export function decodeOauthState(
  stateParam: string | undefined,
): OauthStateObject | null {
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
    // FIXME use schema to parse
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
