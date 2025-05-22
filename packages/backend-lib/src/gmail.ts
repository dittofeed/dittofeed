import { GaxiosError } from "gaxios";
import { Credentials, OAuth2Client } from "google-auth-library";

import config from "./config";
import { encrypt } from "./secrets";
import { GmailTokensWorkspaceMemberSetting } from "./types";
import { writeSecretWorkspaceMemberSettings } from "./workspaceMemberSettings";

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
  code: string;
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
}) {
  if (originalState !== returnedState) {
    return {
      type: GmailCallbackErrorEnum.StateMismatchError,
    };
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

    return {
      type: GmailCallbackErrorEnum.TokenExchangeError,
      code: e.code,
      data,
    };
  }
  await persistGmailTokens({
    workspaceId,
    workspaceMemberId,
    tokens,
  });
}
