import { GaxiosError } from "gaxios";
import { Credentials, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok, Result } from "neverthrow";
import MailComposer from "nodemailer/lib/mail-composer";
import Mail from "nodemailer/lib/mailer";

import config from "./config";
import { WORKSPACE_OCCUPANT_SETTINGS_NAMES } from "./constants";
import logger from "./logger";
import { decrypt, encrypt } from "./secrets";
import {
  EmailGmailSuccess,
  EmailProviderType,
  GmailTokensWorkspaceMemberSetting,
  MessageGmailServiceFailure,
  SendGmailFailureTypeEnum,
} from "./types";
import {
  getSecretWorkspaceSettingsResource,
  writeSecretWorkspaceOccupantSettings,
} from "./workspaceOccupantSettings";

async function persistGmailTokens({
  workspaceId,
  workspaceOccupantId,
  workspaceOccupantType,
  email,
  tokens,
}: {
  workspaceId: string;
  workspaceOccupantId: string;
  workspaceOccupantType: "WorkspaceMember" | "ChildWorkspaceOccupant";
  email: string;
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
    email,
    accessToken: encryptedAccessToken?.encryptedData ?? undefined,
    accessTokenIv: encryptedAccessToken?.iv ?? undefined,
    accessTokenAuthTag: encryptedAccessToken?.authTag ?? undefined,
    refreshToken: encryptedRefreshToken?.encryptedData ?? undefined,
    refreshTokenIv: encryptedRefreshToken?.iv ?? undefined,
    refreshTokenAuthTag: encryptedRefreshToken?.authTag ?? undefined,
    expiresAt: tokens.expiry_date ?? undefined,
  };
  await writeSecretWorkspaceOccupantSettings({
    workspaceId,
    workspaceOccupantId,
    occupantType: workspaceOccupantType,
    config: gmailConfig,
  });
}

export const GmailCallbackErrorEnum = {
  StateMismatchError: "StateMismatchError",
  TokenExchangeError: "TokenExchangeError",
  UserInfoError: "UserInfoError",
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

export interface GmailUserInfoError {
  type: typeof GmailCallbackErrorEnum.UserInfoError;
  message: string;
  gaxiosErrorCode?: string | number | null;
  gaxiosErrorData?: GoogleOAuthErrorData;
}

export type GmailCallbackError =
  | GmailStateMismatchError
  | GmailTokenExchangeError
  | GmailUserInfoError;

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

  // Fetch user info using the obtained tokens
  let userEmail: string;
  try {
    // oauth2Client now has credentials (access token) set from the getToken call
    const oauth2Api = google.oauth2({
      auth: oauth2Client, // Use the authenticated client
      version: "v2",
    });

    const userInfoResponse = await oauth2Api.userinfo.get();

    if (
      !userInfoResponse.data.email ||
      userInfoResponse.data.verified_email === false
    ) {
      logger().error(
        {
          workspaceId,
          workspaceMemberId,
          userInfo: userInfoResponse.data,
        },
        "Failed to get valid user email from Google userinfo endpoint (email missing or not verified).",
      );
      return err({
        type: GmailCallbackErrorEnum.UserInfoError,
        message: "User email not found or not verified.",
        // Include details from userInfoResponse.data if relevant for debugging
        gaxiosErrorData:
          userInfoResponse.data as unknown as GoogleOAuthErrorData,
      });
    }
    userEmail = userInfoResponse.data.email;
  } catch (e) {
    let errorDetails: Pick<
      GmailUserInfoError,
      "gaxiosErrorCode" | "gaxiosErrorData"
    > = {};
    let errorMessage = "Failed to fetch user information from Google.";

    if (e instanceof GaxiosError) {
      const gaxiosErrorData = e.response?.data as
        | GoogleOAuthErrorData
        | undefined;
      errorDetails = {
        gaxiosErrorCode: e.code,
        gaxiosErrorData,
      };
      errorMessage = `Failed to fetch user info from Google: ${gaxiosErrorData?.error_description ?? gaxiosErrorData?.error ?? e.message}`;
      logger().error(
        {
          workspaceId,
          workspaceMemberId,
          err: e,
          gaxiosErrorCode: e.code,
          gaxiosErrorData,
          originalErrorMessage: e.message,
          googleApiErrorCode: gaxiosErrorData?.error,
          googleApiErrorDescription: gaxiosErrorData?.error_description,
        },
        "GaxiosError fetching user info from Google.",
      );
    } else if (e instanceof Error) {
      errorMessage = `Unknown error fetching user info from Google: ${e.message}`;
      logger().error(
        {
          workspaceId,
          workspaceMemberId,
          err: e,
          originalErrorMessage: e.message,
        },
        "Error fetching user info from Google.",
      );
      // For non-Gaxios errors, decide if you want to rethrow or wrap
      // For now, wrapping as UserInfoError
    } else {
      // Handle non-Error objects thrown
      errorMessage = "Unknown error object fetching user info from Google.";
      logger().error(
        {
          workspaceId,
          workspaceMemberId,
          errorObject: e,
        },
        "Unknown error object type fetching user info from Google.",
      );
    }
    return err({
      type: GmailCallbackErrorEnum.UserInfoError,
      message: errorMessage,
      ...errorDetails,
    });
  }

  // Persist tokens and the fetched email
  await persistGmailTokens({
    workspaceId,
    workspaceOccupantId: workspaceMemberId,
    workspaceOccupantType: "WorkspaceMember",
    email: userEmail,
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
  workspaceOccupantId,
}: {
  workspaceId: string;
  workspaceOccupantId: string;
}): Promise<UnencryptedGmailTokens | null> {
  const settings = unwrap(
    await getSecretWorkspaceSettingsResource({
      workspaceId,
      workspaceOccupantId,
      name: WORKSPACE_OCCUPANT_SETTINGS_NAMES.GmailTokens,
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
  workspaceOccupantId,
  workspaceOccupantType,
}: {
  workspaceId: string;
  workspaceOccupantId: string;
  workspaceOccupantType: "WorkspaceMember" | "ChildWorkspaceOccupant";
}): Promise<UnencryptedGmailTokens | null> {
  const tokens = await getGmailTokens({
    workspaceId,
    workspaceOccupantId,
  });
  if (!tokens) {
    return null;
  }

  if (!tokens.refreshToken) {
    logger().error(
      {
        workspaceId,
        workspaceOccupantId,
      },
      "Cannot refresh Gmail access token for workspace member: missing refresh token.",
    );
    return null;
  }

  const { gmailClientId, gmailClientSecret } = config();
  if (!gmailClientId || !gmailClientSecret) {
    logger().error(
      {
        gmailClientIdProvided: !!gmailClientId,
        gmailClientSecretProvided: !!gmailClientSecret,
      },
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
          workspaceOccupantId,
        },
        "Failed to refresh Gmail access token: response missing access_token or expiry_date.",
      );
      return null;
    }

    // Persist the newly obtained tokens (this will encrypt them)
    await persistGmailTokens({
      workspaceId,
      workspaceOccupantId,
      workspaceOccupantType,
      email: "placeholder",
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
          workspaceOccupantId,
        },
        "Critical error: Refresh token became null after refresh. Re-authentication may be required.",
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
        workspaceOccupantId,
        err: e,
      },
      "Error refreshing Gmail access token for workspace member",
    );
    return null;
  }
}

const ONE_WEEK_IN_MS = 1000 * 60 * 60 * 24 * 7;

export async function getAndRefreshGmailAccessToken({
  workspaceId,
  workspaceOccupantId,
  workspaceOccupantType,
}: {
  workspaceId: string;
  workspaceOccupantId: string;
  workspaceOccupantType: "WorkspaceMember" | "ChildWorkspaceOccupant";
}): Promise<UnencryptedGmailTokens | null> {
  const tokens = await getGmailTokens({
    workspaceId,
    workspaceOccupantId,
  });
  if (!tokens) {
    return null;
  }
  if (tokens.expiresAt > Date.now() + ONE_WEEK_IN_MS) {
    return tokens;
  }
  return refreshGmailAccessToken({
    workspaceId,
    workspaceOccupantId,
    workspaceOccupantType,
  });
}

export interface SendGmailEmailParams {
  to: string;
  from: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Mail.Headers;
  attachments?: Mail.Attachment[];
}

// --- End TypeBox Schemas ---

export async function sendGmailEmail({
  accessToken,
  params,
}: {
  accessToken: string;
  params: SendGmailEmailParams;
}): Promise<Result<EmailGmailSuccess, MessageGmailServiceFailure>> {
  if (!accessToken) {
    return err({
      errorType: SendGmailFailureTypeEnum.ConfigurationError,
      message: "Access token is missing or empty.",
    });
  }
  let rawEmailBuffer: Buffer;
  try {
    const mailOptions: Mail.Options = {
      from: params.from,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      text: params.bodyText,
      html: params.bodyHtml,
      replyTo: params.replyTo,
      headers: params.headers,
      attachments: params.attachments,
    };
    const mailComposer = new MailComposer(mailOptions);
    rawEmailBuffer = await mailComposer.compile().build();
  } catch (error) {
    logger().info(
      {
        err: error,
        params,
        from: params.from,
        to: params.to,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "Failed to construct email for Gmail sending",
    );
    return err({
      errorType: SendGmailFailureTypeEnum.ConstructionError,
      message: error instanceof Error ? error.message : String(error),
      details: error,
    });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const base64EncodedEmail = rawEmailBuffer.toString("base64url");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: base64EncodedEmail,
      },
    });

    if (res.data.id && res.data.threadId) {
      return ok({
        type: EmailProviderType.Gmail,
        messageId: res.data.id,
        threadId: res.data.threadId,
      });
    }
    // Should not happen if API call was successful (status 200)
    // but Gmail API might return 200 with an error in the body in some edge cases,
    // or if id/threadId are unexpectedly missing.
    logger().info(
      {
        response: res.data,
        params,
        from: params.from,
        to: params.to,
      },
      "Gmail API send call unexpected response: missing id or threadId",
    );
    return err({
      errorType: SendGmailFailureTypeEnum.UnknownError,
      message:
        "Gmail API response missing message ID or threadId after successful-like call.",
      details: res.data,
    });
  } catch (e) {
    if (e instanceof GaxiosError) {
      const googleError = e.response?.data as GoogleOAuthErrorData | undefined;
      const statusCode = e.code; // HTTP status or Gaxios error code string

      // Decide if retryable (typically 5xx or network issues)
      // Gaxios codes are strings like 'ECONNRESET', HTTP status codes are numbers.
      const isRetryable =
        (typeof statusCode === "number" && statusCode >= 500) ||
        (typeof statusCode === "string" &&
          !Number.isNaN(parseInt(statusCode, 10)) &&
          parseInt(statusCode, 10) >= 500) || // Use Number.isNaN
        // This clause will occur if the status code is not a number, indicating
        // a network error
        (typeof statusCode === "string" &&
          Number.isNaN(parseInt(statusCode, 10))); // Use Number.isNaN

      if (isRetryable) {
        logger().error(
          {
            err: e,
            params,
            from: params.from,
            to: params.to,
            statusCode,
            googleErrorCode: googleError?.error,
            googleErrorDescription: googleError?.error_description,
          },
          "Retryable error sending Gmail email",
        );
        throw e; // Throw retryable errors for Temporal (or other retry mechanisms)
      }

      // Non-retryable GaxiosError
      logger().info(
        {
          err: e,
          params,
          from: params.from,
          to: params.to,
          statusCode,
          googleErrorCode: googleError?.error,
          googleErrorDescription: googleError?.error_description,
          originalErrorMessage: e.message,
        },
        "Non-retryable Gmail API error encountered",
      );
      const errorDetails: unknown = googleError ?? e.response?.data;
      return err({
        errorType: SendGmailFailureTypeEnum.NonRetryableGoogleError,
        message:
          googleError?.error_description ?? googleError?.error ?? e.message,
        statusCode,
        googleErrorCode: googleError?.error,
        googleErrorDescription: googleError?.error_description,
        details: errorDetails,
      });
    }
    // Other unexpected errors (non-Gaxios)
    logger().info(
      {
        err: e,
        params,
        from: params.from,
        to: params.to,
        errorMessage: e instanceof Error ? e.message : String(e),
      },
      "Unknown error sending Gmail email",
    );
    // By default, treat other errors as potentially non-retryable from this function's perspective
    // If a specific error type here is known to be retryable, it could be thrown.
    return err({
      errorType: SendGmailFailureTypeEnum.UnknownError,
      message: e instanceof Error ? e.message : String(e),
      details: e,
    });
  }
}
