import { Stack } from "@mui/material";
import axios from "axios";
import config from "backend-lib/src/config";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import {
  getUserSubscriptions,
  lookupUserForSubscriptions,
  updateUserSubscriptions,
} from "backend-lib/src/subscriptionGroups";
import { SubscriptionChange } from "backend-lib/src/types";
import { eq } from "drizzle-orm";
import { UNAUTHORIZED_PAGE } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  SubscriptionParams,
  UserSubscriptionsUpdate,
} from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import React from "react";

import {
  SubscriptionManagement,
  SubscriptionManagementProps,
} from "../../components/subscriptionManagement";
import { apiBase } from "../../lib/apiBase";

type SSP = Omit<SubscriptionManagementProps, "onSubscriptionUpdate"> & {
  apiBase: string;
};
export const getServerSideProps: GetServerSideProps<SSP> = async (ctx) => {
  const params = schemaValidate(ctx.query, SubscriptionParams);
  if (params.isErr()) {
    logger().info(
      {
        query: ctx.query,
        err: params.error,
      },
      "Invalid subscription management params",
    );
    return {
      redirect: {
        destination: UNAUTHORIZED_PAGE,
        permanent: false,
      },
    };
  }
  const { i, w, h, sub, s, ik } = params.value;

  const [userLookupResult, workspace] = await Promise.all([
    lookupUserForSubscriptions({
      workspaceId: w,
      identifier: i,
      identifierKey: ik,
      hash: h,
    }),
    db().query.workspace.findFirst({
      where: eq(schema.workspace.id, w),
    }),
  ]);

  if (userLookupResult.isErr()) {
    logger().info(
      {
        err: userLookupResult.error,
      },
      "Failed user lookup",
    );
    return {
      redirect: {
        destination: UNAUTHORIZED_PAGE,
        permanent: false,
      },
    };
  }

  if (!workspace) {
    logger().error({
      err: new Error("Workspace not found"),
    });

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
    logger().debug(
      {
        subscriptionId: s,
        subscriptionChange: sub,
      },
      "Subscription change",
    );

    subscriptionChange =
      sub === "1"
        ? SubscriptionChange.Subscribe
        : SubscriptionChange.Unsubscribe;

    await updateUserSubscriptions({
      workspaceId: w,
      userUpdates: [
        {
          userId,
          changes: {
            [s]: sub === "1",
          },
        },
      ],
    });
  }

  const subscriptions = await getUserSubscriptions({
    userId,
    workspaceId: w,
  });

  const props: SSP = {
    apiBase: apiBase(),
    subscriptions,
    hash: h,
    identifier: i,
    identifierKey: ik,
    workspaceId: w,
    workspaceName: workspace.name,
  };
  if (subscriptionChange) {
    props.subscriptionChange = subscriptionChange;
  }
  if (s) {
    props.changedSubscription = s;
  }

  return { props };
};

const SubscriptionManagementPage: NextPage<SSP> =
  function SubscriptionManagementPage(props) {
    const { apiBase } = props;
    const onUpdate: SubscriptionManagementProps["onSubscriptionUpdate"] =
      async (update) => {
        const data: UserSubscriptionsUpdate = update;
        await axios({
          method: "PUT",
          url: `${apiBase}/api/public/subscription-management/user-subscriptions`,
          data,
          headers: {
            "Content-Type": "application/json",
          },
        });
      };
    const {
      workspaceId,
      subscriptions,
      subscriptionChange,
      changedSubscription,
      hash,
      identifier,
      identifierKey,
      workspaceName,
    } = props;
    return (
      <Stack
        justifyContent="center"
        alignItems="center"
        sx={{ height: "100vh" }}
      >
        <SubscriptionManagement
          workspaceId={workspaceId}
          subscriptions={subscriptions}
          subscriptionChange={subscriptionChange}
          changedSubscription={changedSubscription}
          hash={hash}
          identifier={identifier}
          identifierKey={identifierKey}
          workspaceName={workspaceName}
          onSubscriptionUpdate={onUpdate}
        />
      </Stack>
    );
  };

export default SubscriptionManagementPage;
