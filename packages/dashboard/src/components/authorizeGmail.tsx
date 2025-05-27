import CheckIcon from "@mui/icons-material/Check";
import { Box, Button, Typography } from "@mui/material";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

import { useUniversalRouter } from "../lib/authModeProvider";
import { useGmailAuthorizationQuery } from "../lib/useGmailAuthorizationQuery";

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
  const { data, isLoading } = useGmailAuthorizationQuery();
  const isAuthorized = data?.authorized ?? false;

  // Call onAuthorize when authorization status becomes true
  useEffect(() => {
    if (isAuthorized && onAuthorize) {
      onAuthorize();
    }
  }, [isAuthorized, onAuthorize]);

  const handleConnectGmailClick = () => {
    // Don't proceed if already authorized or externally disabled
    if (isAuthorized || disabled) return;

    // 1. Generate a CSRF token and get the current path for returnTo
    const csrfToken = uuidv4();
    const returnTo = router.asPath;

    // 2. Create the state object
    const stateObject = {
      csrf: csrfToken,
      returnTo,
    };

    // 3. JSON.stringify and Base64Url encode the state object
    //    Using btoa for Base64 encoding (works in browser) and making it URL-safe.
    let stateParam;
    try {
      const jsonString = JSON.stringify(stateObject);
      stateParam = btoa(jsonString)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    } catch (error) {
      console.error("Error encoding state object:", error);
      alert("An error occurred preparing your request. Please try again.");
      return;
    }

    // 4. Store only the CSRF token in a short-lived cookie
    const cookieExpiry = new Date(Date.now() + 5 * 60 * 1000).toUTCString();
    document.cookie = `gmail_oauth_state=${csrfToken};path=/;expires=${cookieExpiry};SameSite=Lax;Secure`;

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
      access_type: "offline", // Important to get a refresh token
      prompt: "consent", // Optional: forces the consent screen every time, good for testing
      // or if you want users to re-confirm scopes. Can be removed for production.
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // 6. Redirect the user's browser to this Google URL
    window.location.href = googleAuthUrl;
  };

  // Determine button color based on state
  let buttonColor: "primary" | "success" | "inherit" = "primary";
  if (isAuthorized) {
    buttonColor = "success";
  }

  // Determine button text based on state
  let buttonText: React.ReactNode = "Connect Gmail Account";
  if (isLoading) {
    buttonText = "Checking authorization...";
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
        disabled={isLoading || isAuthorized || disabled}
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
