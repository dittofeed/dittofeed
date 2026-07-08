import { GetServerSideProps } from "next";
import { validate } from "uuid";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = ctx.query.id;
  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }
  return {
    redirect: {
      destination: `/segments/${id}`,
      permanent: false,
    },
  };
};

export default function SegmentV1Redirect() {
  return null;
}
