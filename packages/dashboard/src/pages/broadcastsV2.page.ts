import { GetServerSideProps } from "next";
import qs from "qs";

// allow easy redirect from the deliveries table
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const queryString = qs.stringify(ctx.query);
  const destination = queryString
    ? `/broadcasts/v2?${queryString}`
    : "/broadcasts/v2";

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};
