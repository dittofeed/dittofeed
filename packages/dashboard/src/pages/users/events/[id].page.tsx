import { GetServerSideProps, NextPage } from "next";

import { UserEventsTable } from "../../../components/userEventsTable";
import { UserLayout } from "../../../components/userLayout";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";

interface UserEventsPageProps {
  userId: string;
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<UserEventsPageProps>
> = requestContext(async (ctx, dfContext) => {
  const userId = ctx.query.id;
  if (typeof userId !== "string") {
    return { notFound: true };
  }

  return {
    props: addInitialStateToProps({
      serverInitialState: {},
      dfContext,
      props: { userId },
    }),
  };
});

const UserEvents: NextPage<UserEventsPageProps> = function UserEvents({
  userId,
}) {
  return (
    <UserLayout userId={userId}>
      <UserEventsTable userId={userId} />
    </UserLayout>
  );
};

export default UserEvents;
