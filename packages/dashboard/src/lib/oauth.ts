import { ok, err, Result } from "neverthrow";

interface OauthCallbackSuccess {
  type: "success";
  redirectUrl: string;
}

interface OauthCallbackError {
  type: "error";
  reason: string;
  redirectUrl: string;
}

export function handleOauthCallback({
  workspaceId,
  provider,
  code,
  state,
}: {
  workspaceId: string;
  provider?: string;
  code?: string;
  state?: string;
}): Result<OauthCallbackSuccess, OauthCallbackError> {}
