import { GetServerSideProps } from "next";
import qs from "qs";
import { validate } from "uuid";

// Redirect to the new segment editor page passing the id as a query param
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = ctx.params?.id;
  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }
  const queryParams = { ...ctx.query, id };
  const url = `/segments/v1?${qs.stringify(queryParams)}`;
  return {
    redirect: {
      destination: url,
      permanent: false,
    },
  };
};

export default function NewSegment() {
  return null;
}
