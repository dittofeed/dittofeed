import { Box, Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import {
  getBroadcastMessageTemplateId,
  getBroadcastMessageTemplateName,
} from "isomorphic-lib/src/broadcasts";
import { defaultEmailDefinition } from "isomorphic-lib/src/email";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  EmailContentsType,
  EmailTemplateResource,
  MessageTemplateResourceDefinition,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useMessageTemplateQuery } from "../../lib/useMessageTemplateQuery";
import { useMessageTemplateUpdateMutation } from "../../lib/useMessageTemplateUpdateMutation";
import EmailEditor from "../messages/emailEditor";
import SmsEditor from "../messages/smsEditor";
import WebhookEditor from "../messages/webhookEditor";
import {
  MessageTemplateAutocomplete,
  MessageTemplateChangeHandler,
  SimpleMessageTemplate,
} from "../messageTemplateAutocomplete";
import { BroadcastState } from "./broadcastsShared";

function BroadcastMessageTemplateEditor({
  broadcastId,
  disabled,
}: {
  broadcastId: string;
  disabled: boolean;
}) {
  const { workspace } = useAppStorePick(["workspace"]);
  const broadcastMutation = useBroadcastMutation(broadcastId);
  const { data: broadcast } = useBroadcastQuery(broadcastId);
  const messageTemplateId = useMemo<string | undefined>(
    () => broadcast?.messageTemplateId,
    [broadcast?.messageTemplateId],
  );
  const [emailContentsType, setEmailContentsType] = useState<EmailContentsType>(
    EmailContentsType.LowCode,
  );
  const { data: messageTemplate } = useMessageTemplateQuery(messageTemplateId);

  const updateMessageTemplateMutation = useMessageTemplateUpdateMutation();

  const isInternalTemplate = useMemo(() => {
    if (workspace.type !== CompletionStatus.Successful) {
      return false;
    }
    const workspaceId = workspace.value.id;
    return (
      messageTemplateId ===
      getBroadcastMessageTemplateId({ broadcastId, workspaceId })
    );
  }, [messageTemplateId, broadcastId, workspace]);

  const messageType = broadcast?.config.message.type;
  useEffect(() => {
    if (
      isInternalTemplate ||
      workspace.type !== CompletionStatus.Successful ||
      !messageType
    ) {
      return;
    }
    const workspaceId = workspace.value.id;
    const newMessageTemplateId = getBroadcastMessageTemplateId({
      broadcastId,
      workspaceId,
    });
    const newMessageTemplateName = getBroadcastMessageTemplateName({
      broadcastId,
    });

    let definition: MessageTemplateResourceDefinition;
    switch (messageType) {
      case ChannelType.Email:
        // FIXME add email provider
        definition = defaultEmailDefinition({
          emailContentsType,
        }) satisfies EmailTemplateResource;
        break;
      case ChannelType.Sms:
        definition = {
          type: ChannelType.Sms,
          body: "test",
        };
        break;
      default:
        return;
    }

    updateMessageTemplateMutation.mutate(
      {
        id: newMessageTemplateId,
        name: newMessageTemplateName,
        definition,
        resourceType: "Internal",
      },
      {
        onSuccess: () => {
          broadcastMutation.mutate({ messageTemplateId: newMessageTemplateId });
        },
      },
    );
  }, [workspace, isInternalTemplate, messageType]);

  if (!messageTemplate || !messageTemplateId || !isInternalTemplate) {
    return null;
  }
  let editor: React.ReactNode;
  switch (messageTemplate.definition?.type) {
    case ChannelType.Email:
      editor = (
        <Stack spacing={2}>
          <ToggleButtonGroup
            value={emailContentsType}
            exclusive
            onChange={(_, newValue) => {
              // FIXME update definition
              setEmailContentsType(newValue);
            }}
          >
            <ToggleButton value={EmailContentsType.LowCode}>
              Low Code
            </ToggleButton>
            <ToggleButton value={EmailContentsType.Code}>Code</ToggleButton>
          </ToggleButtonGroup>
          <EmailEditor templateId={messageTemplateId} disabled={disabled} />
        </Stack>
      );
      break;
    case ChannelType.Sms:
      editor = <SmsEditor templateId={messageTemplateId} disabled={disabled} />;
      break;
    case ChannelType.Webhook:
      editor = (
        <WebhookEditor templateId={messageTemplateId} disabled={disabled} />
      );
      break;
    default:
      return null;
  }
  return editor;
}

export default function Content({ state }: { state: BroadcastState }) {
  const { workspace } = useAppStorePick(["workspace"]);
  const { data: broadcast } = useBroadcastQuery(state.id);
  const broadcastMutation = useBroadcastMutation(state.id);
  const [selectExistingTemplate, setSelectExistingTemplate] = useState<
    "existing" | "new" | null
  >(null);
  const disabled = broadcast?.status !== "Draft";

  useEffect(() => {
    if (
      !broadcast ||
      workspace.type !== CompletionStatus.Successful ||
      selectExistingTemplate !== null
    ) {
      return;
    }
    if (
      broadcast.messageTemplateId &&
      broadcast.messageTemplateId ===
        getBroadcastMessageTemplateId({
          broadcastId: state.id,
          workspaceId: workspace.value.id,
        })
    ) {
      setSelectExistingTemplate("existing");
      return;
    }
    setSelectExistingTemplate("new");
  }, [broadcast, state.id, workspace, selectExistingTemplate]);

  const handleMessageTemplateChange: MessageTemplateChangeHandler = useCallback(
    (template: SimpleMessageTemplate | null) => {
      setSelectExistingTemplate(template ? "existing" : "new");
    },
    [setSelectExistingTemplate],
  );

  let templateSelect: React.ReactNode;
  switch (selectExistingTemplate) {
    case "existing":
      templateSelect = (
        <Box sx={{ maxWidth: 600 }}>
          <MessageTemplateAutocomplete
            messageTemplateId={broadcast?.messageTemplateId}
            handler={handleMessageTemplateChange}
          />
        </Box>
      );
      break;
    case "new":
      templateSelect = (
        <BroadcastMessageTemplateEditor
          broadcastId={state.id}
          disabled={disabled}
        />
      );
      break;
    case null:
      templateSelect = null;
      break;
    default:
      assertUnreachable(selectExistingTemplate);
  }
  if (!broadcast) {
    return null;
  }
  return (
    <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
      <ToggleButtonGroup
        value={selectExistingTemplate}
        exclusive
        disabled={disabled || selectExistingTemplate === null}
        onChange={(_, newValue) => {
          if (newValue !== null) {
            setSelectExistingTemplate(newValue);
          }
          if (newValue === "existing") {
            broadcastMutation.mutate({ messageTemplateId: null });
          }
        }}
      >
        <ToggleButton value="existing">Existing Template</ToggleButton>
        <ToggleButton value="new">New Template</ToggleButton>
      </ToggleButtonGroup>
      <Box
        sx={{
          flex: 1,
        }}
      >
        {templateSelect}
      </Box>
    </Stack>
  );
}
