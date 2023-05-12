import {
  buildSubscriptionChangeEvent,
  generateSubscriptionHash,
  getUserSubscriptions,
  lookupUserForSubscriptions,
} from "backend-lib/src/subscriptionGroups";
import { SubscriptionChange } from "backend-lib/src/types";
import { insertUserEvents } from "backend-lib/src/userEvents";
import {
  SUBSCRIPTION_SECRET_NAME,
  UNAUTHORIZED_PAGE,
} from "isomorphic-lib/src/constants";
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
  const { i, w, h, sub, s, ik } = params.value;

  const userLookupResult = await lookupUserForSubscriptions({
    workspaceId: w,
    identifier: i,
    identifierKey: ik,
    hash: h,
  });

  if (userLookupResult.isErr()) {
    return {
      redirect: {
        destination: UNAUTHORIZED_PAGE,
        permanent: false,
      },
    };
  }

  const { userId } = userLookupResult.value;

  let subscriptionChange: SubscriptionChange | undefined;
  if (s && sub) {
    subscriptionChange =
      sub === "1"
        ? SubscriptionChange.Subscribe
        : SubscriptionChange.UnSubscribe;

    const segment = await prisma().segment.findFirst({
      where: {
        workspaceId: w,
        subscriptionGroupId: s,
      },
    });

    if (!segment) {
      throw new Error(`Segment not found for subscription group ${s}`);
    }

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
            segmentId: segment.id,
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
      subscriptionChange,
      changedSubscription: s,
      hash: h,
      identifier: i,
      identifierKey: ik,
      workspaceId: w,
    },
  };
};

const SubscriptionManagement: NextPage<SubscriptionManagementProps> =
  function SubscriptionManagement(props) {
    return (
      <>
        <Head>
          <title>Dittofeed</title>
          <meta name="description" content="Open Source Customer Engagement" />
        </Head>
        <main>
          <SubscriptionManagement {...props} />
        </main>
      </>
    );
  };

export default SubscriptionManagement;
