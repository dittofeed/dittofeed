import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import {
  ChannelType,
  MessageTemplateResource,
  ResourceTypeEnum,
} from "isomorphic-lib/src/types";
import { useMemo } from "react";

import { useMessageTemplatesQuery } from "../lib/useMessageTemplatesQuery";

// Define a simpler type for message templates, assuming id and name exist
export interface SimpleMessageTemplate {
  id: string;
  name: string;
}

function getMessageTemplateLabel(mt: SimpleMessageTemplate) {
  return mt.name;
}

export type MessageTemplateChangeHandler = (
  template: SimpleMessageTemplate | null,
) => void;

export function MessageTemplateAutocomplete({
  messageTemplateId,
  disabled,
  handler,
  channel,
  label,
}: {
  messageTemplateId?: string;
  disabled?: boolean;
  handler: MessageTemplateChangeHandler;
  channel?: ChannelType;
  label?: string;
}) {
  const { data: queryData, isLoading } = useMessageTemplatesQuery({
    resourceType: ResourceTypeEnum.Declarative,
  });

  const messageTemplateItems: SimpleMessageTemplate[] = useMemo(() => {
    // Adapt based on the actual structure returned by useMessageTemplatesQuery
    const templates = queryData;
    if (!templates) {
      return [];
    }
    // Assuming MessageTemplateResource has id and name properties
    return templates.flatMap((t: MessageTemplateResource) => {
      if (channel && t.definition?.type !== channel) {
        return [];
      }
      return {
        id: t.id,
        name: t.name,
      };
    });
  }, [queryData, channel]);

  const messageTemplate = useMemo(() => {
    return (
      messageTemplateItems.find(
        (mt: SimpleMessageTemplate) => mt.id === messageTemplateId,
      ) ?? null
    );
  }, [messageTemplateItems, messageTemplateId]);

  return (
    <Autocomplete
      value={messageTemplate}
      options={messageTemplateItems}
      disabled={disabled || isLoading}
      getOptionLabel={getMessageTemplateLabel}
      onChange={(_event, t) => {
        handler(t);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label ?? "Message Template"}
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isLoading ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
