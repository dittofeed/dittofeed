import React from "react";
import { v4 as uuidv4 } from "uuid";

export function AuthorizeGmail() {
  const handleConnectGmailClick = () => {
    // 1. Generate a cryptographically random state string
    const state = uuidv4();

    // 2. Store this state temporarily in a short-lived cookie
    // accessible by getServerSideProps during the callback.
    // Max-age is in seconds (e.g., 300 seconds = 5 minutes).
    // SameSite=Lax is a good default for OAuth state cookies.
    const cookieExpiry = new Date(Date.now() + 5 * 60 * 1000).toUTCString();
    document.cookie = `gmail_oauth_state=${state};path=/;expires=${cookieExpiry};SameSite=Lax;Secure`;

    // 3. Construct the Google OAuth authorization URL
    const googleClientId = process.env.NEXT_PUBLIC_GMAIL_CLIENT_ID;

    if (!googleClientId) {
      console.error(
        "Google Client ID is not configured. Please set NEXT_PUBLIC_GMAIL_CLIENT_ID.",
      );
      // Optionally, show an error to the user in the UI
      alert(
        "Gmail integration is not configured correctly. Please contact support.",
      );
      return;
    }

    const redirectUri = `${window.location.origin}/dashboard/oauth2/callback/gmail`;

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
      state,
      access_type: "offline", // Important to get a refresh token
      prompt: "consent", // Optional: forces the consent screen every time, good for testing
      // or if you want users to re-confirm scopes. Can be removed for production.
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // 4. Redirect the user's browser to this Google URL
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
