import { GetServerSideProps } from "next";
import qs from "qs";
import { validate } from "uuid";

// Redirect to the new journey editor page passing the id as a query param
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = ctx.params?.id;
  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }
  const queryParams = { ...ctx.query, id };
  const url = `/journeys/v2?${qs.stringify(queryParams)}`;
  return {
    redirect: {
      destination: url,
      permanent: false,
    },
  };
};

export default function Journey() {
  return null;
}
