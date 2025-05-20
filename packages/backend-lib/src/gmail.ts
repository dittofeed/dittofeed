import { GaxiosError } from "gaxios";
import { Credentials, OAuth2Client } from "google-auth-library";

async function persistGmailTokens({
  workspaceId,
  workspaceMemberId,
  tokens,
}: {
  workspaceId: string;
  workspaceMemberId: string;
  tokens: Credentials;
}) {}

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
  const oauth2Client = new OAuth2Client(
    // TODO pull from env vars
    "FIXME_CLIENT_ID", // Your Google Client ID
    "FIXME_CLIENT_SECRET", // Your Google Client Secret
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

  // tokens will contain:
  // tokens.access_token
  // tokens.refresh_token (if access_type=offline was used and it's the first exchange)
  // tokens.expiry_date
  // tokens.id_token (if openid scope was included)
  // tokens.scope
  // tokens.token_type
}
