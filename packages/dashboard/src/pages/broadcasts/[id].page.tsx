import { GetServerSideProps } from "next";
import { validate } from "uuid";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const id = context.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return { notFound: true };
  }

  return {
    redirect: {
      destination: `/broadcasts/segment/${id}`,
      permanent: false,
    },
  };
};

export default function BroadcastPage() {
  return null;
}
