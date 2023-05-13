import {
  getUserSubscriptions,
  lookupUserForSubscriptions,
  updateUserSubscriptions,
} from "backend-lib/src/subscriptionGroups";
import { SubscriptionChange } from "backend-lib/src/types";
import { UNAUTHORIZED_PAGE } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { SubscriptionParams } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import React from "react";

import {
  SubscriptionManagement,
  SubscriptionManagementProps,
} from "../components/subscriptionManagement";

export const getServerSideProps: GetServerSideProps<
  Omit<SubscriptionManagementProps, "onSubscriptionUpdate">
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
    await updateUserSubscriptions({
      workspaceId: w,
      userId,
      changes: {
        [s]: sub === "1",
      },
    });
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

const onUpdate: SubscriptionManagementProps["onSubscriptionUpdate"] = async (
  changes
) => {
  return;
};

const SubscriptionManagementPage: NextPage<
  Omit<SubscriptionManagementProps, "onSubscriptionUpdate">
> = function SubscriptionManagementPage(props) {
  const {
    workspaceId,
    subscriptions,
    subscriptionChange,
    changedSubscription,
    hash,
    identifier,
    identifierKey,
  } = props;
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <SubscriptionManagement
          workspaceId={workspaceId}
          subscriptions={subscriptions}
          subscriptionChange={subscriptionChange}
          changedSubscription={changedSubscription}
          hash={hash}
          identifier={identifier}
          identifierKey={identifierKey}
          onSubscriptionUpdate={onUpdate}
        />
      </main>
    </>
  );
};

export default SubscriptionManagementPage;
