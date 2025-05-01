import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { getBroadcastMessageTemplateId } from "isomorphic-lib/src/broadcasts";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  MessageTemplateDefinition,
} from "isomorphic-lib/src/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
import { useMessageTemplateUpdateMutation } from "../../lib/useMessageTemplateUpdateMutation";
import {
  MessageTemplateAutocomplete,
  MessageTemplateChangeHandler,
  SimpleMessageTemplate,
} from "../messageTemplateAutocomplete";
import MessageTemplateEditor, {
  MessageTemplateEditorState,
} from "../messageTemplateEditor";
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

  useEffect(() => {
    if (
      isInternalTemplate ||
      workspace.type !== CompletionStatus.Successful ||
      !broadcast ||
      broadcast.version !== "V2"
    ) {
      return;
    }
    const workspaceId = workspace.value.id;
    const newMessageTemplateId = getBroadcastMessageTemplateId({
      broadcastId,
      workspaceId,
    });
    const newMessageTemplateName = `Broadcast - ${broadcastId}`;

    let definition: MessageTemplateDefinition;
    switch (broadcast.config.message.type) {
      case ChannelType.Email:
        definition = {
          type: ChannelType.Email,
          from: "test@test.com",
          subject: "test",
          body: "test",
        };
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

    updateMessageTemplatesMutation.mutate(
      {
        id: newMessageTemplateId,
        name: newMessageTemplateName,
        definition,
        resourceType: "Internal",
        workspaceId,
        createOnly: true,
      },
      {
        onSuccess: () => {
          broadcastMutation.mutate({ messageTemplateId: newMessageTemplateId });
        },
      },
    );
  }, [
    workspace,
    messageTemplateId,
    broadcastId,
    isInternalTemplate,
    broadcast,
    broadcastMutation,
    updateMessageTemplatesMutation,
  ]);

  const messageTemplatesUpdateMutation = useUpdateMessageTemplatesMutation();

  const updateTemplateCallback = useDebouncedCallback(
    (state: MessageTemplateEditorState) => {
      if (!state.definition || !state.name) {
        return;
      }
      messageTemplatesUpdateMutation.mutate({
        id: state.id,
        definition: state.definition,
        name: state.name,
      });
    },
    1500,
  );

  if (messageTemplateId === undefined || !isInternalTemplate) {
    return null;
  }

  return (
    <MessageTemplateEditor
      disabled={disabled}
      templateId={messageTemplateId}
      onChange={updateTemplateCallback}
    />
  );
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
    <Stack spacing={2}>
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
      {templateSelect}
    </Stack>
  );
}
