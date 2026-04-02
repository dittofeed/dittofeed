import axios from "axios";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { parse, serialize } from "cookie";
import {
  OAUTH_COOKIE_NAME,
  OIDC_ID_TOKEN_COOKIE_NAME,
} from "isomorphic-lib/src/constants";
import { GetServerSideProps, NextPage } from "next";

import { decodeSsoState } from "../../../lib/oidcSsoLogin";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { query, req, res } = ctx;
  const cfg = backendConfig();

  if (cfg.authMode !== "multi-tenant") {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  const { code } = query;
  const stateParam = query.state;
  if (typeof code !== "string" || typeof stateParam !== "string") {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const state = decodeSsoState(stateParam);
  const cookies = parse(req.headers.cookie ?? "");
  const csrfCookie = cookies[OAUTH_COOKIE_NAME];
  if (!state || !csrfCookie || state.csrf !== csrfCookie) {
    logger().warn("OIDC SSO callback CSRF/state mismatch");
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  if (!cfg.openIdTokenUrl || !cfg.openIdClientId || !cfg.openIdClientSecret) {
    logger().error("OIDC token endpoint or client credentials missing");
    return {
      redirect: { destination: "/404", permanent: false },
    };
  }

  const dashboardUrl = cfg.dashboardUrl.replace(/\/$/, "");
  const redirectUri = `${dashboardUrl}/dashboard/oauth2/callback/sso`;

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.openIdClientId,
      client_secret: cfg.openIdClientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await axios.post<{ id_token?: string }>(
      cfg.openIdTokenUrl,
      body.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        validateStatus: () => true,
      },
    );

    if (tokenRes.status >= 400 || !tokenRes.data.id_token) {
      logger().error(
        {
          status: tokenRes.status,
          data: tokenRes.data,
        },
        "OIDC token exchange failed",
      );
      return {
        redirect: { destination: "/login", permanent: false },
      };
    }

    const secure = cfg.sessionCookieSecure;
    const idTokenCookie = serialize(
      OIDC_ID_TOKEN_COOKIE_NAME,
      tokenRes.data.id_token,
      {
        path: "/",
        httpOnly: true,
        secure,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      },
    );
    const clearCsrf = serialize(OAUTH_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
    });
    res.setHeader("Set-Cookie", [idTokenCookie, clearCsrf]);

    return {
      redirect: { destination: "/journeys", permanent: false },
    };
  } catch (e) {
    logger().error({ err: e }, "OIDC token exchange error");
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }
};

const OidcSsoCallbackPage: NextPage = function OidcSsoCallbackPage() {
  return null;
};

export default OidcSsoCallbackPage;
