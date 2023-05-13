import LoadingButton from "@mui/lab/LoadingButton";
import { Stack, Typography, useTheme } from "@mui/material";
import {
  CompletionStatus,
  SubscriptionGroupResource,
  SubscriptionGroupType,
  UpsertSubscriptionGroupResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import { BulletList, BulletListItem } from "../../components/bulletList";
import EditableName from "../../components/editableName";
import InfoBox from "../../components/infoBox";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import { PropsWithInitialState } from "../../lib/types";
import getSubscriptionGroupsSSP from "./getSubscriptionGroupsSSP";
import SubscriptionGroupLayout, {
  SubscriptionGroupTabLabel,
} from "./subscriptionGroupLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  getSubscriptionGroupsSSP;

export default function SubscriptionGroupConfig() {
  const theme = useTheme();
  const path = useRouter();
  const subscriptionGroupUpdateRequest = useAppStore(
    (store) => store.subscriptionGroupUpdateRequest
  );
  const updateEditedSubscriptionGroup = useAppStore(
    (store) => store.updateEditedSubscriptionGroup
  );
  const editedSubscriptionGroup = useAppStore(
    (store) => store.editedSubscriptionGroup
  );
  const setSubscriptionGroupUpdateRequest = useAppStore(
    (store) => store.setSubscriptionGroupUpdateRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const upsertSubscriptionGroup = useAppStore(
    (store) => store.upsertSubscriptionGroup
  );
  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const workspace = useAppStore((store) => store.workspace);

  const handleSubmit = useMemo(() => {
    if (
      workspace.type !== CompletionStatus.Successful ||
      !id ||
      !editedSubscriptionGroup
    ) {
      console.error("failed to submit", workspace, id, editedSubscriptionGroup);
      return;
    }
    const { name } = editedSubscriptionGroup;
    const upsertResource: UpsertSubscriptionGroupResource = {
      workspaceId: workspace.value.id,
      name,
      id,
      type: SubscriptionGroupType.OptIn,
    };

    return apiRequestHandlerFactory({
      request: subscriptionGroupUpdateRequest,
      setRequest: setSubscriptionGroupUpdateRequest,
      responseSchema: SubscriptionGroupResource,
      setResponse: (broadcast) => {
        upsertSubscriptionGroup(broadcast);
        updateEditedSubscriptionGroup(broadcast);
      },
      // TODO redirect on completion
      onSuccessNotice: `Saved subscription group ${name}`,
      onFailureNoticeHandler: () =>
        `API Error: Failed to save subscription group ${name}`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/subscription-groups`,
        data: upsertResource,
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
  }, [
    workspace,
    id,
    editedSubscriptionGroup,
    subscriptionGroupUpdateRequest,
    setSubscriptionGroupUpdateRequest,
    apiBase,
    upsertSubscriptionGroup,
    updateEditedSubscriptionGroup,
  ]);

  if (!editedSubscriptionGroup) {
    console.error("missing editedSubscriptionGroup");
    return null;
  }

  if (!id) {
    console.error("missing subscription group id");
    return null;
  }

  return (
    <SubscriptionGroupLayout tab={SubscriptionGroupTabLabel.Configure} id={id}>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
        <Stack
          direction="row"
          sx={{ alignItems: "center", width: "100%" }}
          spacing={2}
        >
          <Typography variant="h4">Create a Subscription Group</Typography>
          <EditableName
            variant="h6"
            sx={{ minWidth: theme.spacing(52) }}
            name={editedSubscriptionGroup.name}
            onChange={(e) =>
              updateEditedSubscriptionGroup({ name: e.target.value })
            }
          />
          <LoadingButton
            onClick={handleSubmit}
            loading={
              subscriptionGroupUpdateRequest.type ===
              CompletionStatus.InProgress
            }
            variant="contained"
          >
            Save
          </LoadingButton>
        </Stack>
        <InfoBox>
          Subscription groups define a group of users who are eligible to
          receive a set of messages. They are useful for:
          <BulletList sx={{ p: 1 }} dense disablePadding>
            <BulletListItem>
              Building hand curated lists of users to message.
            </BulletListItem>
            <BulletListItem>
              Providing users with the option to opt in and out of your
              messaging.
            </BulletListItem>
          </BulletList>
        </InfoBox>
      </Stack>
    </SubscriptionGroupLayout>
  );
}
