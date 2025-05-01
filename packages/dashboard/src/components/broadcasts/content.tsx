import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { getBroadcastMessageTemplateId } from "isomorphic-lib/src/broadcasts";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { useCallback, useEffect, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useBroadcastMutation } from "../../lib/useBroadcastMutation";
import { useBroadcastQuery } from "../../lib/useBroadcastQuery";
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
  return (
    <Stack spacing={2}>
      <Typography variant="caption" sx={{ mb: -1 }}>
        New Message Template
      </Typography>
    </Stack>
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
