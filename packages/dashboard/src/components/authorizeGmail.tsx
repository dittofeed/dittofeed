import { useRouter } from "next/router";
import React from "react";
import { v4 as uuidv4 } from "uuid";

export function AuthorizeGmail({ gmailClientId }: { gmailClientId: string }) {
  const router = useRouter();

  const handleConnectGmailClick = () => {
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

    const redirectUri = `${window.location.origin}/dashboard/oauth2/callback/gmail`;

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

  return (
    <div>
      <button
        type="button"
        onClick={handleConnectGmailClick}
        style={{
          padding: "10px 15px",
          fontSize: "16px",
          cursor: "pointer",
          backgroundColor: "#4285F4", // Google's blue
          color: "white",
          border: "none",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
      >
        Connect Gmail Account
      </button>
      <p style={{ marginTop: "10px", fontSize: "12px", color: "#555" }}>
        You will be redirected to Google to authorize access to send emails on
        your behalf.
      </p>
    </div>
  );
}
