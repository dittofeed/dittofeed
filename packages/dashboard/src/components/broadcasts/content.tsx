import { Box, Stack, Typography } from "@mui/material";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { useCallback, useState } from "react";

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
        <MessageTemplateAutocomplete
          messageTemplateId={broadcast?.messageTemplateId}
          handler={handleMessageTemplateChange}
        />
      );
      break;
    case "new":
      templateSelect = (
        <Box sx={{ maxWidth: 600 }}>
          <BroadcastMessageTemplateEditor
            broadcastId={state.id}
            disabled={disabled}
          />
        </Box>
      );
      break;
    case null:
      templateSelect = null;
      break;
    default:
      assertUnreachable(selectExistingTemplate);
  }
  return (
    <Stack spacing={2}>
      <Typography variant="caption" sx={{ mb: -1 }}>
        Message Template
      </Typography>
      {templateSelect}
    </Stack>
  );
}
