# Gmail OAuth Popup Flow Plan

This document outlines the steps to convert the existing redirect-based Gmail OAuth flow to a popup-based flow.

## 1. Modify `AuthorizeGmail.tsx` (Main Window / Initiator)

The component that initiates the OAuth flow (`authorizeGmail.tsx`) needs to be updated to manage the popup window and listen for its completion.

*   **Update `handleConnectGmailClick`:**
    *   Instead of `window.location.href = googleAuthUrl;`, use `window.open(googleAuthUrl, 'googleOAuthPopup', 'width=600,height=700');` to open the Google authentication URL in a new popup window. Store the reference to this popup.
    *   Add a new field to the `OauthStateObject` when it's created: `flow: "popup"`. This will be encoded into the `state` parameter.
    ```typescript
    const stateObject: OauthStateObject = {
      csrf: csrfToken,
      returnTo, // This might be less relevant for popup, but good to keep for consistency
      workspaceId: workspace.value.id,
      token,
      flow: "popup", // New flag
    };
    ```
*   **Listen for Popup Completion/Closure:**
    *   After opening the popup, the main window needs to know when the OAuth process is done (either successfully or with an error within the popup's responsibility, or if the user closes it).
    *   Since the actual token persistence status will be checked via API, we don't strictly need `postMessage` for the *result* of the OAuth token exchange, but it's useful for the popup to signal "I'm done processing, you can now check the API."
    *   Implement a mechanism to detect when the popup closes. A simple way is to use a timer (`setInterval`) to check `popup.closed`.
    ```typescript
    // Inside handleConnectGmailClick or a useEffect triggered by popup opening
    const popup = window.open(googleAuthUrl, 'googleOAuthPopup', 'width=600,height=700');
    if (popup) {
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          // Popup has been closed, trigger a re-fetch of authorization status
          // This could be by invalidating a React Query cache or calling a refresh function
          // e.g., queryClient.invalidateQueries(['gmailAuthorizationStatus']);
          // or refetch(); from useGmailAuthorizationQuery
          console.log("OAuth popup closed, refreshing auth status.");
          // Assuming 'data' and 'isLoading' come from useGmailAuthorizationQuery,
          // its underlying mechanism should re-fetch when relevant queries are invalidated.
          // If direct re-fetch is needed: useGmailAuthorizationQuery.refetch(); (if exposed)
        }
      }, 500);
    } else {
      // Handle popup blocker
      alert("Popup blocked. Please allow popups for this site.");
    }
    ```
*   **UI Updates:**
    *   Disable the "Connect Gmail" button and show a loading/waiting indicator while the popup is open.
    *   The existing `useGmailAuthorizationQuery` should automatically reflect the new authorization state once the tokens are written to the backend and its cache is updated/invalidated by the popup closure logic.

## 2. Modify `packages/dashboard/src/pages/oauth2/callback/[provider].page.tsx` (Callback Page)

This page will be opened in the popup after the user interacts with Google. It needs to handle the OAuth code, communicate back to the main window (opener), and then close itself.

*   **Update `getServerSideProps`:**
    *   Retrieve the `code` and `state` query parameters as done currently.
    *   Decode the `state` parameter.
    *   Access the `validatedState.flow` property.
    *   The `handleOauthCallback` function will be called as usual. This function is responsible for exchanging the code for tokens and persisting them.
    *   **If `validatedState.flow === "popup"`:**
        *   After `handleOauthCallback` completes (successfully or with an error that it handles by preparing a specific redirect URL for errors):
            *   Do **not** return a redirect object.
            *   Instead, render a minimal HTML page containing a script.
            *   This script will simply call `window.close();`. The main window will detect the closure and then re-query the API for the authorization status.

    ```typescript
    // Inside getServerSideProps in [provider].page.tsx

    // ... existing state validation ...
    const isPopupFlow = validatedState?.flow === "popup";

    const callbackResult = await handleOauthCallback({
      workspaceId: dfContext.workspace.id,
      provider,
      code,
      returnTo: validatedState?.returnTo, // May still be useful for error scenarios
      occupantId: dfContext.member.id,
      occupantType: "WorkspaceMember",
      baseRedirectUri: "/dashboard/oauth2/callback", // Existing
    });

    if (isPopupFlow) {
      // Regardless of callbackResult success or error, if it's a popup flow,
      // the page should attempt to close itself. The main window polls for status.
      // The handleOauthCallback will have already attempted to save tokens or logged errors.
      return {
        props: {
          isPopupFlow: true,
          // We don't need to pass success/error status to the page body
          // as it will just close. Logging is handled by handleOauthCallback.
        },
      };
    }

    // Existing redirect logic for non-popup flows or if popup flow needs a redirect due to error
    if (callbackResult.isErr()) {
      logger().error(
        {
          err: callbackResult.error,
          workspaceId: dfContext.workspace.id,
        },
        "failed to handle oauth callback",
      );
      return {
        redirect: {
          permanent: false,
          destination: callbackResult.error.redirectUrl, // Or a generic error page
        },
      };
    }
    return {
      redirect: {
        permanent: false,
        destination: callbackResult.value.redirectUrl, // Default success redirect
      },
    };
    ```

*   **Modify the Page Component:**
    The default export of `[provider].page.tsx` needs to render differently if `isPopupFlow` is true.

    ```typescript
    // At the top of [provider].page.tsx
    import { useEffect } from 'react';

    // ... existing getServerSideProps ...

    interface CallbackPageProps {
      isPopupFlow?: boolean;
      // Potentially other props if needed for a message, but primarily for closing.
    }

    export default function CallbackPage({ isPopupFlow }: CallbackPageProps) {
      useEffect(() => {
        if (isPopupFlow) {
          // Small delay to ensure any postMessage (if we were using it) could send
          // and to allow parent to potentially react if needed, though not strictly required with polling.
          setTimeout(() => {
            window.close();
          }, 100); // Short delay
        }
      }, [isPopupFlow]);

      if (isPopupFlow) {
        return (
          <div>
            <p>Processing authentication... You can close this window.</p>
            {/* Optional: A button to manually close if window.close() fails for some reason */}
            {/* <button onclick="window.close()">Close</button> */}
          </div>
        );
      }

      // Fallback for non-popup scenarios, or if rendered without props
      // (though getServerSideProps should always provide it or redirect)
      // This part should ideally not be reached if flow control in GSSP is correct.
      throw new Error("CallbackPage rendered unexpectedly for non-popup flow or without props.");
    }
    ```

## 3. Security Considerations

*   **CSRF Protection:** The existing mechanism of generating a `csrfToken`, storing it in the `stateObject`, and validating it on the callback side remains crucial and is unaffected by the popup flow itself. The `OAUTH_COOKIE_NAME` cookie containing the original CSRF token should still be sent by the browser when the `/oauth2/callback/...` URL is requested in the popup.
*   **`postMessage` (If we were to use it for more than signaling closure):**
    *   **Main Window (Receiver):** Would need to verify `event.origin` against `window.location.origin`.
    *   **Popup Window (Sender):** Would need to use a specific `targetOrigin` (e.g., `window.opener.location.origin`) instead of `*`.
    *   Since we're relying on the popup closing and the main window re-querying an API for the actual authorization status, the complexity and security risks of `postMessage` for transferring the *result* are minimized. The primary mechanism is the popup closing.
*   **State Parameter:** Ensure the `state` parameter is robustly encoded and decoded to prevent manipulation. Base64 URL encoding is standard.

## 4. `handleOauthCallback` in `../../lib/oauth`

The `handleOauthCallback` function (likely in `packages/dashboard/src/lib/oauth.ts`) should largely remain the same. Its responsibility is to:
1.  Validate the state.
2.  Exchange the `code` for tokens with the OAuth provider.
3.  Call the appropriate backend function (e.g., `handleGmailCallback` from `backend-lib`) to persist the tokens and user info.
4.  Return a `Result` object indicating success (with a `redirectUrl`) or failure (with an error type and `redirectUrl`).

The key is that the *caller* of `handleOauthCallback` (i.e., `getServerSideProps` in the callback page) will decide what to do based on the `isPopupFlow` flag and the `Result` from `handleOauthCallback`. If it's a popup, it will trigger `window.close()` instead of a redirect for success. For errors, it might still redirect within the popup to an error page, or close and let the main window figure out the error by polling. For simplicity, just closing on any outcome (success/failure of token exchange) from the popup's perspective is fine, as the main window re-queries.

## Summary of Changes:

*   **`AuthorizeGmail.tsx`**: Opens popup, adds `flow: "popup"` to state, polls for popup closure, re-fetches auth status on closure.
*   **`pages/oauth2/callback/[provider].page.tsx`**: Checks for `flow: "popup"` in state. If present, renders a page that calls `window.close()` after `handleOauthCallback` (which saves tokens) has run.
*   No direct changes needed to `backend-lib/src/gmail.ts` for the popup mechanism itself, as it's called by `handleOauthCallback`.
*   Minimal changes to `lib/oauth.ts` unless `handleOauthCallback` needs to be aware of the popup flow for different error handling (unlikely if the callback page itself handles the "close vs redirect" logic).

This approach minimizes direct communication between the popup and the main window, relying instead on the main window re-validating state with the backend once the popup has completed its task and closed.
