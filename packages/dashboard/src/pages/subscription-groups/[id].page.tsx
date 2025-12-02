import LoadingButton from "@mui/lab/LoadingButton";
import {
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
  useTheme,
} from "@mui/material";
import { SelectInputProps } from "@mui/material/Select/SelectInput";
import {
  ChannelType,
  CompletionStatus,
  SavedSubscriptionGroupResource,
  SubscriptionGroupType,
  UpsertSubscriptionGroupResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

import { BulletList, BulletListItem } from "../../components/bulletList";
import { EditableTitle } from "../../components/editableName/v2";
import InfoBox from "../../components/infoBox";
import InfoTooltip from "../../components/infoTooltip";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore, useAppStorePick } from "../../lib/appStore";
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
  const {
    subscriptionGroupUpdateRequest,
    updateEditedSubscriptionGroup,
    editedSubscriptionGroup,
    setSubscriptionGroupUpdateRequest,
    apiBase,
    upsertSubscriptionGroup,
    enableMobilePush,
    subscriptionGroups,
  } = useAppStorePick([
    "subscriptionGroups",
    "subscriptionGroupUpdateRequest",
    "updateEditedSubscriptionGroup",
    "editedSubscriptionGroup",
    "setSubscriptionGroupUpdateRequest",
    "apiBase",
    "enableMobilePush",
    "upsertSubscriptionGroup",
  ]);
  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const workspace = useAppStore((store) => store.workspace);

  const onChannelChangeHandler: SelectInputProps<ChannelType>["onChange"] = (
    e,
  ) => {
    if (editedSubscriptionGroup) {
      updateEditedSubscriptionGroup({
        id: editedSubscriptionGroup.id,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        channel: e.target.value as ChannelType,
      });
    }
  };

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
      type: editedSubscriptionGroup.type,
      channel: editedSubscriptionGroup.channel,
    };

    return apiRequestHandlerFactory({
      request: subscriptionGroupUpdateRequest,
      setRequest: setSubscriptionGroupUpdateRequest,
      responseSchema: SavedSubscriptionGroupResource,
      setResponse: (sg) => {
        upsertSubscriptionGroup(sg);
        updateEditedSubscriptionGroup(sg);
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

  const optIn = editedSubscriptionGroup.type === SubscriptionGroupType.OptIn;
  const hasBeenCreated = subscriptionGroups.some((sg) => sg.id === id);
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
          <EditableTitle
            sx={{ minWidth: theme.spacing(52) }}
            text={editedSubscriptionGroup.name}
            onSubmit={(val) => updateEditedSubscriptionGroup({ name: val })}
          />
        </Stack>

        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={optIn}
                onChange={(e) => {
                  updateEditedSubscriptionGroup({
                    type: e.target.checked
                      ? SubscriptionGroupType.OptIn
                      : SubscriptionGroupType.OptOut,
                  });
                }}
              />
            }
            label={
              <InfoTooltip
                title={
                  optIn
                    ? "Users will only be members of this subscription group if they explicitly opt in."
                    : "Users will be members of this subscription group by default unless they explicitly opt out."
                }
              >
                <>{optIn ? "Opt-In" : "Opt-Out"}</>
              </InfoTooltip>
            }
          />
        </FormGroup>
        <InfoTooltip
          title={`The messaging channel which users can subscribe and unsubscribe to.${
            hasBeenCreated
              ? " Cannot modify the channel of an existing subscription group."
              : ""
          }`}
        >
          <FormControl
            sx={{ width: theme.spacing(16) }}
            disabled={hasBeenCreated}
          >
            <InputLabel id="message-channel-select-label">
              Message Channel
            </InputLabel>
            <Select
              labelId="message-channel-select-label"
              label="Message Channel"
              onChange={onChannelChangeHandler}
              value={editedSubscriptionGroup.channel}
            >
              <MenuItem value={ChannelType.Email}>Email</MenuItem>
              <MenuItem value={ChannelType.Sms}>SMS</MenuItem>
              <MenuItem value={ChannelType.Webhook}>Webhook</MenuItem>
              <MenuItem
                disabled={!enableMobilePush}
                value={ChannelType.MobilePush}
              >
                Mobile Push
              </MenuItem>
            </Select>
          </FormControl>
        </InfoTooltip>
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
        <LoadingButton
          onClick={handleSubmit}
          loading={
            subscriptionGroupUpdateRequest.type === CompletionStatus.InProgress
          }
          variant="contained"
        >
          Save
        </LoadingButton>
      </Stack>
    </SubscriptionGroupLayout>
  );
}
