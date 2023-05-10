import { UserSubscriptionsResource } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";

import { PropsWithInitialState } from "../lib/types";

interface SubscriptionManagementProps {
  subscriptions: UserSubscriptionsResource;
}

export const getServerSideProps: GetServerSideProps<
  SubscriptionManagementProps
> = async (ctx) => {
  return {
    props: {
      subscriptions: {
        subscribed: [],
        unsubscribed: [],
      },
    },
  };
};

export default function SubscriptionManagement() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>subscription management</main>
    </>
  );
}
