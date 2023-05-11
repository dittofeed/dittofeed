import {
  buildSubscriptionChangeEvent,
  generateSubscriptionHash,
  getSubscriptionContext,
  getUserSubscriptions,
} from "backend-lib/src/subscriptionGroups";
import { SubscriptionChange } from "backend-lib/src/types";
import { insertUserEvents } from "backend-lib/src/userEvents";
import { UNAUTHORIZED_PAGE } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { SubscriptionParams } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import React from "react";

import { SubscriptionManagementProps } from "../components/subscriptionManagement";
import prisma from "../lib/prisma";

export const getServerSideProps: GetServerSideProps<
  SubscriptionManagementProps
> = async (ctx) => {
  const params = schemaValidate(ctx.query, SubscriptionParams);
  if (params.isErr()) {
    return {
      redirect: {
        destination: UNAUTHORIZED_PAGE,
        permanent: false,
      },
    };
  }
  const { i, w, h, sub, s } = params.value;

  const context = await getSubscriptionContext({
    workspaceId: w,
    identifier: i,
    subscriptionGroupId: s,
  });

  if (context.isErr()) {
    return {
      redirect: {
        destination: UNAUTHORIZED_PAGE,
        permanent: false,
      },
    };
  }

  const { segmentId, identifierKey, subscriptionSecret, userId } =
    context.value;

  const expectedHash = generateSubscriptionHash({
    workspaceId: w,
    userId,
    identifierKey,
    identifier: i,
    subscriptionSecret,
  });

  if (expectedHash !== h) {
    return {
      redirect: {
        destination: UNAUTHORIZED_PAGE,
        permanent: false,
      },
    };
  }

  if (sub) {
    const subscriptionChange =
      sub === "1"
        ? SubscriptionChange.Subscribe
        : SubscriptionChange.UnSubscribe;

    const event = buildSubscriptionChangeEvent({
      action: subscriptionChange,
      subscriptionGroupId: s,
      userId,
    });

    await Promise.all([
      prisma().segmentAssignment.update({
        where: {
          workspaceId_userId_segmentId: {
            workspaceId: w,
            userId,
            segmentId,
          },
        },
        data: {
          inSegment: sub === "1",
        },
      }),
      insertUserEvents({
        workspaceId: w,
        userEvents: [event],
      }),
    ]);
  }

  const subscriptions = await getUserSubscriptions({
    userId,
    workspaceId: w,
  });

  return {
    props: {
      subscriptions,
    },
  };
};

const SubscriptionManagement: NextPage<SubscriptionManagementProps> =
  function SubscriptionManagement({ subscriptions }) {
    return (
      <>
        <Head>
          <title>Dittofeed</title>
          <meta name="description" content="Open Source Customer Engagement" />
        </Head>
        <main>
          <SubscriptionManagement subscriptions={subscriptions} />
        </main>
      </>
    );
  };

export default SubscriptionManagement;
