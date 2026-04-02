import backendConfig from "backend-lib/src/config";
import { serialize } from "cookie";
import { OIDC_ID_TOKEN_COOKIE_NAME } from "isomorphic-lib/src/constants";
import { GetServerSideProps, NextPage } from "next";

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const cfg = backendConfig();
  const secure = cfg.sessionCookieSecure;
  const clearId = serialize(OIDC_ID_TOKEN_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    secure,
    sameSite: "lax",
  });
  res.setHeader("Set-Cookie", clearId);

  if (cfg.authMode === "multi-tenant") {
    return {
      redirect: { destination: "/login?signedOut=1", permanent: false },
    };
  }

  return {
    redirect: { destination: "/", permanent: false },
  };
};

const SignOutPage: NextPage = function SignOutPage() {
  return null;
};

export default SignOutPage;
