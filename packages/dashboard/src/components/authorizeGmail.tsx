import CheckIcon from "@mui/icons-material/Check";
import { Box, Button, Typography } from "@mui/material";
import { CompletionStatus, OauthFlowEnum } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { useAppStorePick } from "../lib/appStore";
import { useUniversalRouter } from "../lib/authModeProvider";
import { OauthStateObject } from "../lib/oauth";
import { useGmailAuthorizationQuery } from "../lib/useGmailAuthorizationQuery";
import { useOauthSetCsrfMutation } from "../lib/useOauthSetCsrfMutation";

const CSRF_TOKEN_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function AuthorizeGmail({
  gmailClientId,
  disabled,
  onAuthorize,
}: {
  gmailClientId: string;
  disabled?: boolean;
  onAuthorize?: () => void;
}) {
  const router = useRouter();
  const universalRouter = useUniversalRouter();
  const { workspace } = useAppStorePick(["workspace"]);
  const { data, isLoading, refetch } = useGmailAuthorizationQuery();
  const isAuthorized = data?.authorized ?? false;
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const setCsrfCookieMutation = useOauthSetCsrfMutation();

  useEffect(() => {
    if (isAuthorized && onAuthorize) {
      onAuthorize();
    }
  }, [isAuthorized, onAuthorize]);

  const handleConnectGmailClick = useCallback(async () => {
    if (workspace.type !== CompletionStatus.Successful || isPopupOpen) {
      return;
    }
    const currentWorkspaceId = workspace.value.id;

    if (isAuthorized || disabled) return;

    const tokenFromQuery =
      typeof router.query.token === "string" ? router.query.token : undefined;

    const csrfToken = uuidv4();

    const fullStateObject: OauthStateObject = {
      csrf: csrfToken,
      workspaceId: currentWorkspaceId,
      token: tokenFromQuery,
      flow: OauthFlowEnum.PopUp,
    };

    try {
      const expiresAtDate = new Date(Date.now() + CSRF_TOKEN_CACHE_EXPIRY_MS);
      await setCsrfCookieMutation.mutateAsync({
        csrfToken,
        expiresAt: expiresAtDate.toISOString(),
      });
    } catch (error) {
      console.error("Failed to set CSRF cookie via API:", error);
      return;
    }

    let stateParam;
    try {
      const jsonString = JSON.stringify(fullStateObject);
      stateParam = btoa(jsonString)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    } catch (error) {
      console.error("Error encoding state object:", error);
      return;
    }

    const redirectPath = universalRouter.mapUrl(
      "/oauth2/callback/gmail",
      undefined,
      {
        includeBasePath: true,
        excludeQueryParams: true,
      },
    );
    const redirectUri = `${window.location.origin}${redirectPath}`;

    const params = new URLSearchParams({
      client_id: gmailClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
      state: stateParam,
      access_type: "offline",
      prompt: "consent",
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    const popup = window.open(
      googleAuthUrl,
      "googleOAuthPopup",
      "width=600,height=700,resizable,scrollbars",
    );

    if (popup) {
      setIsPopupOpen(true);
      const timer = setInterval(async () => {
        if (popup.closed) {
          clearInterval(timer);
          setIsPopupOpen(false);
          await refetch();
        }
      }, 500);
    }
  }, [
    workspace,
    isPopupOpen,
    isAuthorized,
    disabled,
    router.query.token,
    gmailClientId,
    universalRouter,
    refetch,
    setCsrfCookieMutation,
  ]);

  let buttonColor: "primary" | "success" | "inherit" = "primary";
  if (isAuthorized) {
    buttonColor = "success";
  }

  let buttonText: React.ReactNode = "Connect Gmail Account";
  if (isLoading && !isPopupOpen) {
    buttonText = "Checking authorization...";
  } else if (isPopupOpen || setCsrfCookieMutation.isPending) {
    buttonText = "Awaiting Gmail Authorization...";
  } else if (isAuthorized) {
    buttonText = (
      <>
        <CheckIcon sx={{ mr: 1, fontSize: 20 }} />
        Gmail Connected
      </>
    );
  }

  return (
    <Box>
      <Button
        variant="contained"
        color={buttonColor}
        onClick={handleConnectGmailClick}
        disabled={
          isLoading ||
          isAuthorized ||
          disabled ||
          isPopupOpen ||
          setCsrfCookieMutation.isPending
        }
        sx={{
          textTransform: "none",
          fontSize: "16px",
          py: 1.25,
          px: 2,
          boxShadow: 2,
          "&.Mui-disabled": {
            backgroundColor: isAuthorized ? "success.main" : undefined,
            color: isAuthorized ? "white" : undefined,
            opacity: isAuthorized ? 0.9 : undefined,
          },
        }}
      >
        {buttonText}
      </Button>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 1.25, display: "block" }}
      >
        {isAuthorized ? (
          <>
            <Box
              component="span"
              sx={{ color: "success.main", fontWeight: "bold" }}
            >
              <CheckIcon
                sx={{ fontSize: 14, verticalAlign: "middle", mr: 0.5 }}
              />
              Connected
            </Box>
            {" - Your Gmail account is authorized to send emails."}
          </>
        ) : (
          "You will be redirected to Google to authorize access to send emails on your behalf."
        )}
      </Typography>
    </Box>
  );
}
