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
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { getDefaultMessageTemplateDefinition } from "../../lib/defaultTemplateDefinition";
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

function EmailControls({
  emailContentType,
  setEmailContentType,
  broadcastId,
  disabled,
  allowedEmailContentsTypes,
}: {
  broadcastId: string;
  emailContentType: EmailContentsType | null;
  setEmailContentType: (emailContentType: EmailContentsType | null) => void;
  disabled?: boolean;
  allowedEmailContentsTypes?: EmailContentsType[];
}) {
  const { data: broadcast } = useBroadcastQuery(broadcastId);
  const updateMessageTemplateMutation = useMessageTemplateUpdateMutation();

  // If allowedEmailContentsTypes is undefined, empty, or has both types, show toggle
  const shouldShowToggle =
    !allowedEmailContentsTypes ||
    allowedEmailContentsTypes.length === 0 ||
    allowedEmailContentsTypes.length === 2;

  if (!shouldShowToggle) {
    return null;
  }

  return (
    <ToggleButtonGroup
      value={emailContentType}
      exclusive
      disabled={disabled}
      onChange={(_, newValue) => {
        setEmailContentType(newValue);
        if (broadcast?.messageTemplateId) {
          updateMessageTemplateMutation.mutate({
            id: broadcast.messageTemplateId,
            name: broadcast.name,
            definition: defaultEmailDefinition({
              emailContentsType: newValue,
            }),
          });
        }
      }}
    >
      <ToggleButton value={EmailContentsType.LowCode}>Low Code</ToggleButton>
      <ToggleButton value={EmailContentsType.Code}>Code</ToggleButton>
    </ToggleButtonGroup>
  );
}

function ExistingTemplatePreview({ broadcastId }: { broadcastId: string }) {
  const { data: broadcast } = useBroadcastQuery(broadcastId);
  const messageTemplateId = useMemo<string | undefined>(
    () => broadcast?.messageTemplateId,
    [broadcast?.messageTemplateId],
  );
  const { data: messageTemplate } = useMessageTemplateQuery(messageTemplateId);
  if (!messageTemplate || !messageTemplateId) {
    return null;
  }
  switch (messageTemplate.definition?.type) {
    case ChannelType.Email:
      return (
        <EmailEditor
          templateId={messageTemplateId}
          disabled
          hidePublisher
          hideTitle
          hideUserPropertiesPanel
          hideEditor
        />
      );
    case ChannelType.Sms:
      return (
        <SmsEditor
          templateId={messageTemplateId}
          disabled
          hidePublisher
          hideTitle
          hideUserPropertiesPanel
          hideEditor
        />
      );
    case ChannelType.Webhook:
      return (
        <WebhookEditor
          templateId={messageTemplateId}
          disabled
          hidePublisher
          hideTitle
          hideUserPropertiesPanel
          hideEditor
        />
      );
    default:
      return null;
  }
}

function BroadcastMessageTemplateEditor({
  broadcastId,
  disabled,
  hideTemplateUserPropertiesPanel,
  allowedEmailContentsTypes,
}: {
  broadcastId: string;
  disabled: boolean;
  hideTemplateUserPropertiesPanel?: boolean;
  allowedEmailContentsTypes?: EmailContentsType[];
}) {
  const { workspace } = useAppStorePick(["workspace"]);
  const broadcastMutation = useBroadcastMutation(broadcastId);
  const { data: broadcast } = useBroadcastQuery(broadcastId);
  const messageTemplateId = useMemo<string | undefined>(
    () => broadcast?.messageTemplateId,
    [broadcast?.messageTemplateId],
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

    // Determine the appropriate email contents type based on configuration
    let emailContentsType: EmailContentsType | undefined;
    if (messageType === ChannelType.Email && allowedEmailContentsTypes) {
      if (allowedEmailContentsTypes.length === 1) {
        [emailContentsType] = allowedEmailContentsTypes;
      }
    }

    const definition = getDefaultMessageTemplateDefinition(
      messageType,
      emailContentsType,
    );

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
  }, [workspace, isInternalTemplate, messageType, allowedEmailContentsTypes]);

  if (!messageTemplate || !messageTemplateId || !isInternalTemplate) {
    return null;
  }
  let editor: React.ReactNode;
  switch (messageTemplate.definition?.type) {
    case ChannelType.Email:
      editor = (
        <EmailEditor
          templateId={messageTemplateId}
          disabled={disabled}
          hidePublisher
          hideTitle
          hideUserPropertiesPanel={hideTemplateUserPropertiesPanel}
        />
      );
      break;
    case ChannelType.Sms:
      editor = (
        <SmsEditor
          templateId={messageTemplateId}
          disabled={disabled}
          hidePublisher
          hideTitle
          hideUserPropertiesPanel={hideTemplateUserPropertiesPanel}
        />
      );
      break;
    case ChannelType.Webhook:
      editor = (
        <WebhookEditor
          templateId={messageTemplateId}
          disabled={disabled}
          hidePublisher
          hideTitle
          hideUserPropertiesPanel={hideTemplateUserPropertiesPanel}
        />
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
  const [emailContentType, setEmailContentType] =
    useState<EmailContentsType | null>(null);
  const disabled = broadcast?.status !== "Draft";
  const { data: messageTemplate } = useMessageTemplateQuery(
    broadcast?.messageTemplateId,
  );

  useEffect(() => {
    if (
      emailContentType !== null ||
      selectExistingTemplate !== "new" ||
      messageTemplate?.definition?.type !== "Email" ||
      workspace.type !== CompletionStatus.Successful ||
      messageTemplate.id !==
        getBroadcastMessageTemplateId({
          broadcastId: state.id,
          workspaceId: workspace.value.id,
        })
    ) {
      return;
    }

    const contentType =
      "emailContentsType" in messageTemplate.definition
        ? messageTemplate.definition.emailContentsType
        : EmailContentsType.Code;
    setEmailContentType(contentType);
  }, [
    emailContentType,
    broadcast,
    messageTemplate,
    selectExistingTemplate,
    workspace,
    state.id,
  ]);

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
      setSelectExistingTemplate("new");
      return;
    }
    setSelectExistingTemplate("existing");
  }, [broadcast, state.id, workspace, selectExistingTemplate]);

  const handleMessageTemplateChange: MessageTemplateChangeHandler = useCallback(
    (template: SimpleMessageTemplate | null) => {
      const newTemplateId = template?.id ?? null;
      broadcastMutation.mutate({ messageTemplateId: newTemplateId });
    },
    [setSelectExistingTemplate],
  );

  let templateSelect: React.ReactNode;
  switch (selectExistingTemplate) {
    case "existing":
      templateSelect = (
        <Stack spacing={1} sx={{ flex: 1 }}>
          <Box sx={{ maxWidth: 600 }}>
            <MessageTemplateAutocomplete
              messageTemplateId={broadcast?.messageTemplateId}
              handler={handleMessageTemplateChange}
              channel={broadcast?.config.message.type}
              disabled={disabled}
            />
          </Box>
          <ExistingTemplatePreview broadcastId={state.id} />
        </Stack>
      );
      break;
    case "new":
      templateSelect = (
        <BroadcastMessageTemplateEditor
          broadcastId={state.id}
          disabled={disabled}
          hideTemplateUserPropertiesPanel={
            state.configuration?.hideTemplateUserPropertiesPanel
          }
          allowedEmailContentsTypes={
            state.configuration?.allowedEmailContentsTypes
          }
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
  let controls: React.ReactNode;
  if (selectExistingTemplate === "new" && broadcast.messageTemplateId) {
    switch (broadcast.config.message.type) {
      case ChannelType.Email:
        controls = (
          <EmailControls
            broadcastId={broadcast.id}
            disabled={disabled}
            emailContentType={emailContentType}
            setEmailContentType={setEmailContentType}
            allowedEmailContentsTypes={
              state.configuration?.allowedEmailContentsTypes
            }
          />
        );
        break;
      default:
        controls = null;
    }
  }
  return (
    <Stack spacing={2} sx={{ height: "100%", width: "100%", flex: 1 }}>
      <Stack direction="row" spacing={2}>
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
        {controls}
      </Stack>
      {templateSelect}
    </Stack>
  );
}
