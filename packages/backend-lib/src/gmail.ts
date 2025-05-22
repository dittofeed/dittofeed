import { GaxiosError } from "gaxios";
import { Credentials, OAuth2Client } from "google-auth-library";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok, Result } from "neverthrow";

import config from "./config";
import logger from "./logger";
import { decrypt, encrypt } from "./secrets";
import { GmailTokensWorkspaceMemberSetting } from "./types";
import {
  getSecretWorkspaceSettingsResource,
  writeSecretWorkspaceMemberSettings,
} from "./workspaceMemberSettings";

async function persistGmailTokens({
  workspaceId,
  workspaceMemberId,
  tokens,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  tokens: Credentials;
}) {
  const encryptedAccessToken = tokens.access_token
    ? encrypt(tokens.access_token)
    : undefined;
  const encryptedRefreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : undefined;
  const gmailConfig: GmailTokensWorkspaceMemberSetting = {
    type: "GmailTokens",
    accessToken: encryptedAccessToken?.encryptedData ?? undefined,
    accessTokenIv: encryptedAccessToken?.iv ?? undefined,
    accessTokenAuthTag: encryptedAccessToken?.authTag ?? undefined,
    refreshToken: encryptedRefreshToken?.encryptedData ?? undefined,
    refreshTokenIv: encryptedRefreshToken?.iv ?? undefined,
    refreshTokenAuthTag: encryptedRefreshToken?.authTag ?? undefined,
    expiresAt: tokens.expiry_date ?? undefined,
  };
  await writeSecretWorkspaceMemberSettings({
    workspaceId,
    workspaceMemberId,
    config: gmailConfig,
  });
}

export const GmailCallbackErrorEnum = {
  StateMismatchError: "StateMismatchError",
  TokenExchangeError: "TokenExchangeError",
} as const;

export type GmailCallbackErrorType =
  (typeof GmailCallbackErrorEnum)[keyof typeof GmailCallbackErrorEnum];

export interface GmailStateMismatchError {
  type: typeof GmailCallbackErrorEnum.StateMismatchError;
}

export interface GoogleOAuthErrorData {
  error: string;
  error_description?: string;
  error_uri?: string;
}

export interface GmailTokenExchangeError {
  type: typeof GmailCallbackErrorEnum.TokenExchangeError;
  code?: string;
  data?: GoogleOAuthErrorData;
}

export type GmailCallbackError =
  | GmailStateMismatchError
  | GmailTokenExchangeError;

export async function handleGmailCallback({
  workspaceId,
  workspaceMemberId,
  code,
  originalState,
  returnedState,
  redirectUri,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  code: string;
  originalState: string;
  returnedState: string;
  redirectUri: string;
}): Promise<Result<void, GmailCallbackError>> {
  if (originalState !== returnedState) {
    return err({
      type: GmailCallbackErrorEnum.StateMismatchError,
    });
  }
  const { gmailClientId, gmailClientSecret } = config();
  if (!gmailClientId || !gmailClientSecret) {
    throw new Error("Gmail client ID and secret are not set");
  }

  const oauth2Client = new OAuth2Client(
    gmailClientId,
    gmailClientSecret,
    redirectUri,
  );

  let tokens: Credentials;
  try {
    const response = await oauth2Client.getToken(code);
    tokens = response.tokens;
  } catch (e) {
    if (!(e instanceof GaxiosError)) {
      throw e;
    }
    const data = e.response?.data as GoogleOAuthErrorData | undefined;

    return err({
      type: GmailCallbackErrorEnum.TokenExchangeError,
      code: e.code,
      data,
    } satisfies GmailTokenExchangeError);
  }
  await persistGmailTokens({
    workspaceId,
    workspaceMemberId,
    tokens,
  });
  return ok(undefined);
}

export type UnencryptedGmailTokens = Required<
  Pick<
    GmailTokensWorkspaceMemberSetting,
    "accessToken" | "refreshToken" | "expiresAt"
  >
>;

export async function getGmailTokens({
  workspaceId,
  workspaceMemberId,
}: {
  workspaceId: string;
  workspaceMemberId: string;
}): Promise<UnencryptedGmailTokens | null> {
  const settings = unwrap(
    await getSecretWorkspaceSettingsResource({
      workspaceId,
      workspaceMemberId,
      name: "GmailTokens",
    }),
  );
  if (!settings || !settings.config.expiresAt) {
    return null;
  }
  if (
    !settings.config.accessToken ||
    !settings.config.accessTokenIv ||
    !settings.config.accessTokenAuthTag
  ) {
    return null;
  }
  const accessToken = decrypt({
    iv: settings.config.accessTokenIv,
    encryptedData: settings.config.accessToken,
    authTag: settings.config.accessTokenAuthTag,
  });
  if (!accessToken) {
    return null;
  }

  if (
    !settings.config.refreshToken ||
    !settings.config.refreshTokenIv ||
    !settings.config.refreshTokenAuthTag
  ) {
    return null;
  }
  const refreshToken = decrypt({
    iv: settings.config.refreshTokenIv,
    encryptedData: settings.config.refreshToken,
    authTag: settings.config.refreshTokenAuthTag,
  });
  if (!refreshToken) {
    return null;
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: settings.config.expiresAt,
  };
}

export async function refreshGmailAccessToken({
  workspaceId,
  workspaceMemberId,
}: {
  workspaceId: string;
  workspaceMemberId: string;
}): Promise<UnencryptedGmailTokens | null> {
  const tokens = await getGmailTokens({
    workspaceId,
    workspaceMemberId,
  });
  if (!tokens) {
    return null;
  }

  if (!tokens.refreshToken) {
    logger().error(
      {
        workspaceId,
        workspaceMemberId,
      },
      "Cannot refresh Gmail access token for workspace member because missing refresh token.",
    );
    return null;
  }

  const { gmailClientId, gmailClientSecret } = config();
  if (!gmailClientId || !gmailClientSecret) {
    logger().error(
      "Gmail client ID or secret is not configured. Cannot refresh token.",
    );
    throw new Error(
      "Gmail client ID or secret not configured for token refresh.",
    );
  }

  const oauth2Client = new OAuth2Client(gmailClientId, gmailClientSecret);

  oauth2Client.setCredentials({
    refresh_token: tokens.refreshToken,
  });

  try {
    const response = await oauth2Client.refreshAccessToken();
    const newCredentials = response.credentials;

    if (!newCredentials.access_token || !newCredentials.expiry_date) {
      logger().error(
        {
          workspaceId,
          workspaceMemberId,
        },
        "Failed to refresh Gmail access token for workspace member because response missing access_token or expiry_date.",
      );
      return null;
    }

    // Persist the newly obtained tokens (this will encrypt them)
    await persistGmailTokens({
      workspaceId,
      workspaceMemberId,
      tokens: newCredentials,
    });

    // Return the new unencrypted tokens
    const newRefreshToken = newCredentials.refresh_token ?? tokens.refreshToken;
    if (!newRefreshToken) {
      // This case should be rare if the initial tokens.refreshToken was valid.
      // If Google stops returning a refresh token AND the old one was somehow lost/invalid,
      // then we have an issue. For now, logging and potentially failing more gracefully.
      logger().error(
        {
          workspaceId,
          workspaceMemberId,
        },
        "Critical error: Refresh token became null after refresh for workspace member. Re-authentication may be required.",
      );
      return null;
    }

    return {
      accessToken: newCredentials.access_token,
      refreshToken: newRefreshToken,
      expiresAt: newCredentials.expiry_date,
    };
  } catch (e) {
    logger().error(
      {
        workspaceId,
        workspaceMemberId,
        err: e,
      },
      "Error refreshing Gmail access token for workspace member",
    );
    return null;
  }
}
