import logger from "backend-lib/src/logger";
import { GetServerSideProps, NextPage } from "next";
import backendConfig from "backend-lib/src/config";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { URL } from "url";

interface RedirectPageProps {
  returnTo: string;
}

export const getServerSideProps: GetServerSideProps<RedirectPageProps> = async (
  ctx,
) => {
  const { referer } = ctx.req.headers;

  if (
    referer &&
    backendConfig().allowedReferrers.some((ref) => referer.includes(ref))
  ) {
    logger().error(
      { referer, allowedReferrers: backendConfig().allowedReferrers },
      "Host and referer do not match.",
    );
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
