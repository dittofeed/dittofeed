import CheckIcon from "@mui/icons-material/Check";
import { Box, Button, Typography } from "@mui/material";
import { CompletionStatus, OauthFlowEnum } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

import { useAppStorePick } from "../lib/appStore";
import { useUniversalRouter } from "../lib/authModeProvider";
import { useGmailAuthorizationQuery } from "../lib/useGmailAuthorizationQuery";

export function AuthorizeGmail({
  disabled,
  onAuthorize,
}: {
  disabled?: boolean;
  onAuthorize?: () => void;
}) {
  const router = useRouter();
  const universalRouter = useUniversalRouter();
  const { workspace } = useAppStorePick(["workspace"]);
  const { data, isLoading, refetch } = useGmailAuthorizationQuery();
  const isAuthorized = data?.authorized ?? false;
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  useEffect(() => {
    if (isAuthorized && onAuthorize) {
      onAuthorize();
    }
  }, [isAuthorized, onAuthorize]);

  const handleConnectGmailClick = useCallback(async () => {
    if (workspace.type !== CompletionStatus.Successful || isPopupOpen) {
      return;
    }

    if (isAuthorized || disabled) return;

    const initiatePath = universalRouter.mapUrl(
      "/oauth2/initiate/gmail",
      undefined,
      {
        includeBasePath: true,
      },
    );
    const initiateUrl = new URL(`${window.location.origin}${initiatePath}`);

    initiateUrl.searchParams.append("flow", OauthFlowEnum.PopUp);

    const popup = window.open(
      initiateUrl.toString(),
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
    } else {
      console.error("Popup blocked. Please allow popups for this site.");
    }
  }, [
    workspace,
    isPopupOpen,
    isAuthorized,
    disabled,
    router.asPath,
    universalRouter,
    refetch,
  ]);

  let buttonColor: "primary" | "success" | "inherit" = "primary";
  if (isAuthorized) {
    buttonColor = "success";
  }

  let buttonText: React.ReactNode = "Connect Gmail Account";
  if (isLoading && !isPopupOpen) {
    buttonText = "Checking authorization...";
  } else if (isPopupOpen) {
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
        disabled={isLoading || isAuthorized || disabled || isPopupOpen}
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
