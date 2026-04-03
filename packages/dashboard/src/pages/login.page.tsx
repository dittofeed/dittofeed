import { Box, Button, Stack, TextField, Typography, useTheme } from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import backendConfig from "backend-lib/src/config";
import { getRequestContext } from "backend-lib/src/requestContext";
import { serialize } from "cookie";
import { OAUTH_COOKIE_NAME } from "isomorphic-lib/src/constants";
import type { AuthLoginMethodsResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { encodeSsoState } from "../lib/oidcSsoLogin";

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

  const oidcConfigured = Boolean(
    cfg.openIdAuthorizationUrl && cfg.openIdClientId,
  );

  if (!oidcConfigured && !cfg.enablePasswordLogin) {
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
  if (startOAuth && !oidcConfigured) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  if (startOAuth) {
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

    const authUrl = new URL(cfg.openIdAuthorizationUrl!);
    authUrl.searchParams.set("client_id", cfg.openIdClientId!);
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
  }

  return {
    props: {
      signedOut: parseSignedOutFlag(query.signedOut),
      oidcConfigured,
    },
  };
};

interface LoginPageProps {
  signedOut: boolean;
  oidcConfigured: boolean;
}

const LoginPage: NextPage<LoginPageProps> = function LoginPage({
  signedOut,
  oidcConfigured,
}) {
  const theme = useTheme();
  const router = useRouter();
  const hrefSignIn = signedOut
    ? "/login?start=1&prompt=select_account"
    : "/login?start=1";

  const apiAuth = `${router.basePath}/api/auth`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [methods, setMethods] = useState<AuthLoginMethodsResponse | null>(null);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinueEmail = useCallback(async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email.");
      return;
    }
    setLoadingMethods(true);
    try {
      const r = await fetch(`${apiAuth}/login-methods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!r.ok) {
        setError("Could not continue. Try again.");
        return;
      }
      const data = (await r.json()) as AuthLoginMethodsResponse;
      setMethods(data);
      if (data.passwordEnabled) {
        setStep("password");
      } else if (data.oidcEnabled && oidcConfigured) {
        await router.push(hrefSignIn);
      } else {
        setError("No sign-in method is available for this account.");
      }
    } catch {
      setError("Could not continue. Try again.");
    } finally {
      setLoadingMethods(false);
    }
  }, [apiAuth, email, hrefSignIn, oidcConfigured, router]);

  const onPasswordLogin = useCallback(async () => {
    setError(null);
    setLoginPending(true);
    try {
      const r = await fetch(`${apiAuth}/password-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (r.status === 204) {
        await router.push("/journeys");
        return;
      }
      if (r.status === 401) {
        setError("Invalid email or password.");
        return;
      }
      if (r.status === 403) {
        setError("You cannot sign in yet. Ask a workspace admin for access.");
        return;
      }
      setError("Sign-in failed. Try again.");
    } catch {
      setError("Sign-in failed. Try again.");
    } finally {
      setLoginPending(false);
    }
  }, [apiAuth, email, password, router]);

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
                You have been signed out. Sign in again below.
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Use your email to continue with password and/or SSO.
              </Typography>
            )}

            {step === "email" ? (
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  required
                  autoComplete="username"
                  size="small"
                  disabled={loadingMethods}
                />
                {error ? (
                  <Typography variant="body2" color="error">
                    {error}
                  </Typography>
                ) : null}
                <LoadingButton
                  variant="contained"
                  fullWidth
                  size="large"
                  loading={loadingMethods}
                  onClick={() => void onContinueEmail()}
                >
                  Continue
                </LoadingButton>
              </Stack>
            ) : (
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  {email.trim()}
                </Typography>
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  required
                  autoComplete="current-password"
                  size="small"
                  disabled={loginPending}
                />
                {error ? (
                  <Typography variant="body2" color="error">
                    {error}
                  </Typography>
                ) : null}
                <LoadingButton
                  variant="contained"
                  fullWidth
                  size="large"
                  loading={loginPending}
                  onClick={() => void onPasswordLogin()}
                >
                  Sign in with password
                </LoadingButton>
                <Button
                  variant="text"
                  size="small"
                  disabled={loginPending}
                  onClick={() => {
                    setStep("email");
                    setPassword("");
                    setMethods(null);
                    setError(null);
                  }}
                >
                  Use a different email
                </Button>
              </Stack>
            )}

            {step === "email" &&
            oidcConfigured &&
            methods?.oidcEnabled !== false ? (
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Or skip email and go straight to SSO.
                </Typography>
                <Button
                  component={Link}
                  href={hrefSignIn}
                  variant="outlined"
                  fullWidth
                  size="large"
                >
                  Continue with SSO
                </Button>
              </Stack>
            ) : null}

            {step === "password" &&
            oidcConfigured &&
            methods?.oidcEnabled &&
            loadingMethods === false ? (
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Or use your identity provider instead.
                </Typography>
                <Button
                  component={Link}
                  href={hrefSignIn}
                  variant="outlined"
                  fullWidth
                  size="medium"
                >
                  Continue with SSO
                </Button>
              </Stack>
            ) : null}
          </Box>
        </Stack>
      </main>
    </>
  );
};

export default LoginPage;
