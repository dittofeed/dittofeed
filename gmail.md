# Gmail Broadcast Feature - Architecture & Implementation Notes

## High-Level Architecture

The core idea is to treat a user's Gmail account as a specialized Email Service Provider (ESP). Authentication is handled via OAuth 2.0, and emails are sent using the Gmail API.

**Components:**

1.  **Authentication & Authorization (OAuth 2.0 for Gmail):**
    *   **UI (NextJS Dashboard - Client-side):**
        *   Section/button to "Connect Gmail Account."
        *   Client-side JavaScript initiates OAuth 2.0 flow by redirecting to Google, including a `state` parameter for CSRF protection (state stored temporarily, e.g., in a cookie or sessionStorage).
    *   **UI (NextJS Dashboard - Server-side via `getServerSideProps` on callback page e.g., `/dashboard/oauth2/callback/gmail`):**
        *   Receives callback from Google with `code` and `state`.
        *   Validates the received `state` against the originally generated state.
        *   Exchanges the authorization `code` with Google for an access token and a refresh token (this step uses the `client_secret`).
        *   Encrypts these tokens.
        *   Stores the encrypted tokens in Postgres, associated with the user/workspace.
    *   **Token Storage (Postgres):**
        *   Securely store application-level encrypted access and refresh tokens, associated with the user and their Gmail address.

2.  **ESP Configuration:**
    *   Extend ESP domain model to include "Gmail" as a provider type.
    *   Configuration primarily consists of stored OAuth tokens.

3.  **Broadcast Creation & Sending:**
    *   **UI (NextJS Dashboard):**
        *   Allow users to select a connected Gmail account as the sender for a broadcast.
    *   **Broadcast Processing (Temporal Workflows):**
        *   Scheduled broadcasts trigger Temporal workflows.
        *   Workflow activities retrieve Gmail OAuth tokens.
        *   Use Gmail API (`users.messages.send`) to send emails.
        *   Implement token refresh logic using refresh tokens.
        *   Consider Gmail API rate limits; implement delays/batching if needed.
    *   **Error Handling:** Manage API errors (auth, rate limits, etc.).

4.  **Technical Considerations:**
    *   **Google Cloud Project:** Setup project, enable Gmail API, configure OAuth 2.0 credentials.
    *   **Scopes:** Request minimal OAuth scopes (e.g., `https://www.googleapis.com/auth/gmail.send`).
    *   **Security:** Encrypt tokens at rest, protect client secret, use CSRF protection.
    *   **User Experience (UX):**
        *   Clarify emails are sent from the user's Gmail (appear in "Sent," replies to their inbox).
        *   Inform about Gmail sending limits.
    *   **Revocation:** Allow users to disconnect accounts (revoke tokens locally and via Google's API if possible).
    *   **Status Tracking:** Basic success/failure via API. Detailed tracking (opens, clicks) is complex for individual Gmail accounts.

## Implementation Checklist

**Phase 1: Core Authentication & Sending**

*   [ ] **Google Cloud Setup:**
    *   [X] Create Google Cloud Project.
    *   [X] Enable Gmail API.
    *   [X] Configure OAuth 2.0 Consent Screen (ensure `redirect_uri` points to `/dashboard/oauth2/callback/gmail`).
    *   [X] Generate OAuth 2.0 Client ID and Secret (Client Secret will be used by Next.js `getServerSideProps`).
*   [ ] **Frontend - Connect Gmail Account (Next.js Dashboard - Client-side):**
    *   [ ] UI button/link (e.g., in a settings or integrations page) to initiate the "Connect Gmail" flow.
    *   [ ] When clicked, client-side JavaScript will:
        *   [ ] Generate a cryptographically random `state` string.
        *   [ ] Store this `state` temporarily (e.g., in a short-lived cookie accessible by `getServerSideProps` during the callback, or `sessionStorage` if a mechanism is in place to verify it server-side).
        *   [ ] Construct the Google OAuth authorization URL with:
            *   `client_id` (publicly known).
            *   `redirect_uri` (e.g., `YOUR_DASHBOARD_URL/dashboard/oauth2/callback/gmail`).
            *   `response_type=code`.
            *   `scope` (e.g., `https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email`).
            *   The generated `state`.
            *   `access_type=offline` (to ensure a refresh token is returned).
            *   Optionally, `prompt=consent`.
        *   [ ] Redirect the user's browser to this Google URL.
*   [ ] **Frontend - OAuth Callback Page (Next.js - e.g., `/dashboard/oauth2/callback/gmail.page.tsx` - Server-Side Logic):**
    *   [ ] This page will be the `redirect_uri` registered with Google.
    *   [ ] In `getServerSideProps(ctx)`:
        *   [ ] Extract `code` and `returned_state` from `ctx.query`.
        *   [ ] Retrieve the `original_state` stored during initiation (e.g., from `ctx.req.cookies`).
        *   [ ] **Validate `original_state === returned_state`.** If mismatched, handle error (e.g., redirect with error). Clear the state storage (e.g., cookie) after validation.
        *   [ ] If states match, exchange the `code` with Google's token endpoint (`https://oauth2.googleapis.com/token`) for an access token and refresh token. This server-to-server POST request will use:
            *   `code`.
            *   `client_id` (from environment variable).
            *   `client_secret` (from environment variable).
            *   `redirect_uri` (must exactly match the one used to obtain the code).
            *   `grant_type=authorization_code`.
        *   [ ] Optionally, use the new access token to fetch the user's email address from Google's userinfo endpoint (`https://www.googleapis.com/oauth2/v2/userinfo`).
        *   [ ] Encrypt the received access token and refresh token (see "Token Encryption/Decryption" below).
        *   [ ] Store the encrypted tokens, their IVs, auth tags, the user's Gmail address (if fetched), and token expiry in Postgres. Associate this with the workspace/user.
        *   [ ] Determine redirect path for the user (e.g., to `/settings` with success/error query param).
*   [ ] **Database (Postgres):**
    *   [ ] Design schema for storing encrypted Gmail OAuth tokens (user ID, email, encrypted access token, access_token_iv, access_token_auth_tag, encrypted refresh token, refresh_token_iv, refresh_token_auth_tag, access_token_expires_at).
    *   [ ] Implement encryption/decryption mechanism for tokens (see "Token Encryption/Decryption" subsection below).
    *   [ ] **Integrate Encryption in OAuth Flow:**
        *   [ ] In the Next.js `/dashboard/oauth2/callback/gmail.page.tsx`'s `getServerSideProps`, after receiving tokens from Google:
            *   Call `encryptToken` for the access token.
            *   Call `encryptToken` for the refresh token.
    *   [ ] **Integrate Decryption for API Usage:**
        *   [ ] When a Temporal activity (or any service) needs to use a token:
            *   Fetch the encrypted token, its IV, and auth tag from Postgres.
            *   Call `decryptToken` to get the plaintext token.
            *   Use the plaintext token for Google API calls.
*   [ ] **Backend - Gmail Service:**
    *   [ ] Create a service to interact with the Gmail API.
    *   [ ] Method to send an email using an access token.
    *   [ ] Method to refresh an access token using a refresh token.
*   [ ] **Frontend - Connect Gmail Account (NextJS):**
    *   [ ] UI button/link to initiate the "Connect Gmail" flow.
    *   [ ] Page/modal to display status of connection.
*   [ ] **Basic Email Sending (Manual Trigger):**
    *   [ ] Internal mechanism/test endpoint to send a test email using a connected account. This will involve:
        *   [ ] Fetching encrypted refresh token, IV, auth tag.
        *   [ ] Decrypting refresh token.
        *   [ ] Using plaintext refresh token to get a new access token from Google.
        *   [ ] Encrypting the new access token and updating it in the DB (along with its IV, auth tag, and expiry).
        *   [ ] Using the new plaintext access token to call Gmail API.

**Phase 2: Broadcast Integration**

*   [ ] **ESP Model Update:**
    *   [ ] Modify domain models to recognize "Gmail" as an ESP type.
    *   [ ] Adapt configuration logic.
*   [ ] **Frontend - Broadcast Configuration:**
    *   [ ] Allow selection of a connected Gmail account as the sender in the broadcast creation UI.
    *   [ ] Display connected Gmail accounts.
*   [ ] **Temporal Integration:**
    *   [ ] Create/modify Temporal activities for Gmail sending.
        *   [ ] Activity: Fetch valid Gmail access token (refresh if needed).
        *   [ ] Activity: Send email via Gmail API.
    *   [ ] Update broadcast workflows to use these activities when a Gmail ESP is selected.
*   [ ] **Rate Limiting & Error Handling (Temporal):**
    *   [ ] Implement basic retry logic for Gmail API calls within activities.
    *   [ ] Consider basic rate limiting (e.g., short delays between sends for large batches).
*   [ ] **User Management of Connected Accounts:**
    *   [ ] UI to list connected Gmail accounts.
    *   [ ] UI to disconnect a Gmail account (revoke tokens locally, attempt Google API revocation).

**Phase 3: Refinements & Edge Cases**

*   [ ] **Advanced Error Handling & Reporting:**
    *   [ ] Better surfacing of send errors to the user.
*   [ ] **Security Review:**
    *   [ ] Thorough review of token handling and storage.
    *   [ ] Review OAuth implementation against best practices (e.g., state parameter for CSRF).
*   [ ] **Prepare for Google Verification:**
    *   [ ] Ensure privacy policy clearly details use of Gmail scopes.
    *   [ ] Create a video recording demonstrating the complete OAuth flow for connecting a Gmail account and how the application uses the `gmail.send` permission (e.g., sending a test broadcast). This will be needed for Google's verification process.
    *   [ ] Review and fulfill all other requirements listed by Google for app verification when using sensitive/restricted scopes.
*   [ ] **UX Improvements:**
    *   [ ] Clear warnings about Gmail sending limits.
    *   [ ] Guidance on what happens to replies, bounces.
*   [ ] **Documentation:**
    *   [ ] User documentation for the feature.
    *   [ ] Developer documentation for the new services/modules.
*   [ ] **Testing:**
    *   [ ] Unit tests for new services and logic.
    *   [ ] Integration tests for OAuth flow and email sending.
    *   [ ] End-to-end tests for broadcast creation and execution with Gmail.

**Security Notes:**

*   **NEVER** store client secrets in frontend code.
*   All token storage **MUST** be encrypted at rest (database-level) AND application-level encrypted (field-level encryption for tokens).
*   The application-level `TOKEN_ENCRYPTION_KEY` must be managed securely (e.g., via Kubernetes Secrets injected as environment variables) and NOT hardcoded or committed to version control.
*   Use the `state` parameter in OAuth 2.0 to prevent CSRF attacks.
*   Handle token refresh securely.
*   Provide clear mechanisms for users to revoke access.

**Future Considerations (Optional):**

*   [ ] More sophisticated bounce/complaint handling (might be very complex with Gmail API for individual accounts).
*   [ ] Analytics on Gmail sends (if feasible through API or other means).
*   [ ] Support for multiple Gmail accounts per user.

This checklist provides a structured approach. Items can be broken down further as development progresses.

---

## Pseudocode for Token Encryption/Decryption Flow

```typescript
// --- Configuration (Loaded at application startup) ---
// Assume TOKEN_ENCRYPTION_KEY is loaded from environment variables (sourced from K8s Secret)
// const TOKEN_ENCRYPTION_KEY: string = process.env.TOKEN_ENCRYPTION_KEY;
// const ALGORITHM = 'aes-256-gcm';
// const IV_LENGTH = 16; // Or 12 for GCM, be consistent

// --- Encryption Utility (e.g., in a crypto.service.ts) ---

function generateEncryptionKey(): Buffer {
  // In a real scenario, this key is securely managed and provisioned, not generated on the fly
  // For example, fetched from process.env.TOKEN_ENCRYPTION_KEY which is a 32-byte string
  const keyFromEnv = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyFromEnv || Buffer.from(keyFromEnv, 'utf-8').length !== 32) {
    throw new Error('Invalid TOKEN_ENCRYPTION_KEY: must be 32 bytes.');
  }
  return Buffer.from(keyFromEnv, 'utf-8');
}

const MASTER_KEY = generateEncryptionKey();


function encrypt(plaintext: string): { iv: string; encryptedData: string; authTag: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return { 
    iv: iv.toString('hex'), 
    encryptedData: encrypted, 
    authTag: authTag 
  };
}

function decrypt(ciphertext: string, ivHex: string, authTagHex: string): string | null {
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // Log error securely
    console.error("Decryption failed:", error.message);
    return null; // Or throw a specific error to be handled upstream
  }
}

// --- Fastify OAuth Callback Handler (/auth/gmail/callback) ---

async function handleOauthCallback(request, reply) {
  // 1. Exchange authorization_code for tokens from Google
  const { access_token, refresh_token, expires_in } = await exchangeCodeForTokens(request.query.code);

  // 2. Encrypt tokens before storing
  const encryptedAccessToken = encrypt(access_token);
  let encryptedRefreshToken = null;
  if (refresh_token) {
    encryptedRefreshToken = encrypt(refresh_token);
  }

  // 3. Store in Postgres
  //   db.query(
  //     `INSERT INTO gmail_auth (workspace_id, email, 
  //                             encrypted_access_token, access_token_iv, access_token_auth_tag, access_token_expires_at,
  //                             encrypted_refresh_token, refresh_token_iv, refresh_token_auth_tag)
  //      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  //     [
  //       request.user.workspaceId, 
  //       userGmailProfile.email, // Fetched after getting tokens
  //       encryptedAccessToken.encryptedData,
  //       encryptedAccessToken.iv,
  //       encryptedAccessToken.authTag,
  //       new Date(Date.now() + expires_in * 1000),
  //       encryptedRefreshToken?.encryptedData,
  //       encryptedRefreshToken?.iv,
  //       encryptedRefreshToken?.authTag
  //     ]
  //   );

  // ... redirect user ...
}

// --- Temporal Activity / Service that needs to use a token ---

async function getDecryptedRefreshToken(workspaceId: string, userEmail: string): Promise<string | null> {
  // 1. Fetch encrypted refresh token details from Postgres
  //   const result = await db.query(
  //     `SELECT encrypted_refresh_token, refresh_token_iv, refresh_token_auth_tag 
  //      FROM gmail_auth WHERE workspace_id = $1 AND email = $2`, 
  //     [workspaceId, userEmail]
  //   );
  //   const row = result.rows[0];
  //   if (!row || !row.encrypted_refresh_token) return null;

  // 2. Decrypt
  //   return decrypt(row.encrypted_refresh_token, row.refresh_token_iv, row.refresh_token_auth_tag);
  return "decrypted_refresh_token_placeholder"; // Placeholder for actual logic
}

async function sendEmailViaGmailActivity(params: { workspaceId: string; userEmail: string; mailOptions: any }) {
  const plaintextRefreshToken = await getDecryptedRefreshToken(params.workspaceId, params.userEmail);
  if (!plaintextRefreshToken) {
    // Handle missing or undecryptable refresh token (e.g., throw error, notify user to re-auth)
    throw new Error("Refresh token unavailable or invalid. Please re-authenticate Gmail.");
  }

  // 3. Use plaintext refresh token to get a new access token from Google
  const { new_access_token, new_expires_in } = await refreshAccessTokenFromGoogle(plaintextRefreshToken);
  
  // 4. Encrypt the new access token and update DB (important!)
  const encryptedNewAccessToken = encrypt(new_access_token);
  //   db.query(
  //     `UPDATE gmail_auth 
  //      SET encrypted_access_token = $1, access_token_iv = $2, access_token_auth_tag = $3, access_token_expires_at = $4
  //      WHERE workspace_id = $5 AND email = $6`,
  //     [
  //       encryptedNewAccessToken.encryptedData,
  //       encryptedNewAccessToken.iv,
  //       encryptedNewAccessToken.authTag,
  //       new Date(Date.now() + new_expires_in * 1000),
  //       params.workspaceId,
  //       params.userEmail
  //     ]
  //   );
  
  // 5. Use the new_access_token (plaintext) to call Gmail API
  //   await callGmailApi(new_access_token, params.mailOptions);

  return { success: true };
}
```
---
