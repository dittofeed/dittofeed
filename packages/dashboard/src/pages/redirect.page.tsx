import { CircularProgress, Stack } from "@mui/material";
import logger from "backend-lib/src/logger";
import { GetServerSideProps, NextPage } from "next";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { URL } from "url";

interface RedirectPageProps {
  returnTo: string;
}

export const getServerSideProps: GetServerSideProps<RedirectPageProps> = async (
  ctx,
) => {
  const { host, referer } = ctx.req.headers;
  const referrerHost =
    typeof referer === "string" ? new URL(referer).host : null;

  if (host !== referrerHost) {
    logger().error({ host, referer }, "Host and referer do not match.");
    return {
      notFound: true,
    };
  }

  const { returnTo } = ctx.query;

  if (typeof returnTo !== "string") {
    logger().error({ returnTo }, "Invalid returnTo query parameter.");
    return {
      notFound: true,
    };
  }
  return {
    props: {
      returnTo,
    },
  };
};

const RedirectPage: NextPage<RedirectPageProps> = function RedirectPage({
  returnTo,
}) {
  const router = useRouter();
  useEffect(() => {
    router.push(returnTo);
  });
  return <div />;
};

export default RedirectPage;
