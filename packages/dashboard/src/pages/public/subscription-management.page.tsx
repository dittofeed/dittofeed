import { Stack } from "@mui/material";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import logger from "backend-lib/src/logger";
import {
  getUserSubscriptions,
  lookupUserForSubscriptions,
  updateUserSubscriptions,
} from "backend-lib/src/subscriptionGroups";
import { SubscriptionChange } from "backend-lib/src/types";
import { and, eq } from "drizzle-orm";
import { UNAUTHORIZED_PAGE } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { SubscriptionParams } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import React from "react";

import {
  SubscriptionManagement,
  SubscriptionManagementProps,
} from "../../components/subscriptionManagement";
import { apiBase } from "../../lib/apiBase";

type SSP = Omit<SubscriptionManagementProps, "onSubscriptionUpdate"> & {
  apiBase: string;
  changedSubscriptionChannel?: string;
  showAllChannels: boolean;
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
  const {
    i,
    w,
    h,
    sub,
    s,
    ik,
    isPreview: isPreviewParam,
    showAllChannels: showAllChannelsParam,
  } = params.value;
  const isPreview = isPreviewParam === "true";
  const showAllChannels = showAllChannelsParam === "true";

  const [userLookupResult, workspace] = await Promise.all([
    isPreview
      ? null
      : lookupUserForSubscriptions({
          workspaceId: w,
          identifier: i,
          identifierKey: ik,
          hash: h,
        }),
    db().query.workspace.findFirst({
      where: eq(schema.workspace.id, w),
    }),
  ]);

  let userId: string | undefined;
  if (userLookupResult) {
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
    userId = userLookupResult.value.userId;
  } else {
    // handles preview case
    userId = "123-preview";
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

  let subscriptionChange: SubscriptionChange | undefined;
  let changedSubscriptionChannel: string | undefined;
  if (s && sub && !isPreview) {
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

    // Get the subscription group to determine its channel
    const targetSubscriptionGroup =
      await db().query.subscriptionGroup.findFirst({
        where: eq(schema.subscriptionGroup.id, s),
      });

    if (targetSubscriptionGroup) {
      changedSubscriptionChannel = targetSubscriptionGroup.channel;

      // If unsubscribing, unsubscribe from all subscription groups in the same channel
      if (subscriptionChange === SubscriptionChange.Unsubscribe) {
        const channelSubscriptionGroups =
          await db().query.subscriptionGroup.findMany({
            where: and(
              eq(schema.subscriptionGroup.workspaceId, w),
              eq(
                schema.subscriptionGroup.channel,
                targetSubscriptionGroup.channel,
              ),
            ),
          });

        const channelChanges: Record<string, boolean> = {};
        channelSubscriptionGroups.forEach((sg) => {
          channelChanges[sg.id] = false;
        });

        await updateUserSubscriptions({
          workspaceId: w,
          userUpdates: [
            {
              userId,
              changes: channelChanges,
            },
          ],
        });
      } else {
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
    }
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
    isPreview,
    showAllChannels,
  };
  if (subscriptionChange) {
    props.subscriptionChange = subscriptionChange;
  }
  if (s) {
    props.changedSubscription = s;
  }
  if (changedSubscriptionChannel) {
    props.changedSubscriptionChannel = changedSubscriptionChannel;
  }

  return { props };
};

const SubscriptionManagementPage: NextPage<SSP> =
  function SubscriptionManagementPage(props) {
    const {
      apiBase: propsApiBase,
      workspaceId,
      subscriptions,
      subscriptionChange,
      changedSubscription,
      changedSubscriptionChannel,
      hash,
      identifier,
      identifierKey,
      workspaceName,
      isPreview,
      showAllChannels,
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
          changedSubscriptionChannel={changedSubscriptionChannel}
          hash={hash}
          identifier={identifier}
          identifierKey={identifierKey}
          workspaceName={workspaceName}
          apiBase={propsApiBase}
          isPreview={isPreview}
          showAllChannels={showAllChannels}
        />
      </Stack>
    );
  };

export default SubscriptionManagementPage;
