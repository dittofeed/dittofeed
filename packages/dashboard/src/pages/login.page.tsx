import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { getRequestContext } from "backend-lib/src/requestContext";
import { serialize } from "cookie";
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";

import { encodeSsoState } from "../lib/oidcSsoLogin";

/** Google / OIDC `prompt` values we allow to pass through the authorize URL. */
const OIDC_PROMPT_ALLOWLIST = new Set([
  "none",
  "consent",
  "select_account",
  "login",
]);

function parseStartFlag(value: string | string[] | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}

function parseSignedOutFlag(value: string | string[] | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}

function sanitizeOidcPrompt(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const v = Array.isArray(value) ? value[0] : value;
  if (v !== undefined && OIDC_PROMPT_ALLOWLIST.has(v)) {
    return v;
  }
  return undefined;
}

export const getServerSideProps: GetServerSideProps<LoginPageProps> = async ({
  req,
  res,
  query,
}) => {
  const cfg = backendConfig();
  if (cfg.authMode !== "multi-tenant") {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }
  if (!cfg.openIdAuthorizationUrl || !cfg.openIdClientId) {
    return {
      redirect: {
        destination: "/404",
        permanent: false,
      },
    };
  }

  const rc = await getRequestContext(req.headers);
  if (rc.isOk()) {
    return {
      redirect: {
        destination: "/journeys",
        permanent: false,
      },
    };
  }

  const startOAuth = parseStartFlag(query.start);
  if (!startOAuth) {
    return {
      props: {
        signedOut: parseSignedOutFlag(query.signedOut),
      },
    };
  }

  const csrf = uuidv4();
  const state = encodeSsoState(csrf);
  const dashboardUrl = cfg.dashboardUrl.replace(/\/$/, "");
  const redirectUri = `${dashboardUrl}/dashboard/oauth2/callback/sso`;

  const secure = cfg.sessionCookieSecure;
  const csrfCookie = serialize(OAUTH_COOKIE_NAME, csrf, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 600,
  });
  res.setHeader("Set-Cookie", csrfCookie);

  const authUrl = new URL(cfg.openIdAuthorizationUrl);
  authUrl.searchParams.set("client_id", cfg.openIdClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);

  const prompt =
    sanitizeOidcPrompt(query.prompt) ??
    (parseSignedOutFlag(query.signedOut) ? "select_account" : undefined);
  if (prompt) {
    authUrl.searchParams.set("prompt", prompt);
  }

  return {
    redirect: {
      destination: authUrl.toString(),
      permanent: false,
    },
  };
};

interface LoginPageProps {
  signedOut: boolean;
}

const LoginPage: NextPage<LoginPageProps> = function LoginPage({ signedOut }) {
  const theme = useTheme();
  const hrefSignIn = signedOut
    ? "/login?start=1&prompt=select_account"
    : "/login?start=1";

  return (
    <>
      <Head>
        <title>Sign in — Dittofeed</title>
      </Head>
      <main>
        <Stack
          direction="column"
          alignItems="center"
          justifyContent="center"
          sx={{ width: "100%", minHeight: "100vh", p: 2 }}
        >
          <Box
            sx={{
              backgroundColor: "background.paper",
              border: `1px solid ${theme.palette.grey[200]}`,
              padding: 3,
              borderRadius: 1,
              maxWidth: 420,
              width: "100%",
            }}
          >
            <Typography variant="h5" component="h1" gutterBottom>
              Sign in
            </Typography>
            {signedOut ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                You have been signed out. Continue to sign in again with your
                identity provider.
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Sign in with your configured identity provider to open the
                dashboard.
              </Typography>
            )}
            <Button
              component={Link}
              href={hrefSignIn}
              variant="contained"
              fullWidth
              size="large"
            >
              Continue with SSO
            </Button>
          </Box>
        </Stack>
      </main>
    </>
  );
};

export default LoginPage;
