import { Stack, TextField } from "@mui/material";
import {
  ChannelType,
  RenderMessageTemplateRequestContents,
  RenderMessageTemplateType,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import React from "react";

import MobilePushPreviewBody from "../mobilePushPreviewBody";
import TemplateEditor, {
  DraftToPreview,
  TemplateEditorMode,
} from "../templateEditor";

function fieldToReadable(field: string) {
  switch (field) {
    case "title":
      return "Title";
    case "body":
      return "Body";
    case "imageUrl":
      return "Image URL";
    default:
      return null;
  }
}

const draftToPreview: DraftToPreview = (definition) => {
  if (definition.type !== ChannelType.MobilePush) {
    throw new Error("Invalid channel type");
  }
  const content: RenderMessageTemplateRequestContents = {
    title: {
      type: RenderMessageTemplateType.PlainText,
      value: definition.title ?? "",
    },
    body: {
      type: RenderMessageTemplateType.PlainText,
      value: definition.body ?? "",
    },
  };
  if (definition.imageUrl) {
    content.imageUrl = {
      type: RenderMessageTemplateType.PlainText,
      value: definition.imageUrl,
    };
  }
  return content;
};

export default function MobilePushEditor({
  templateId: messageId,
  hideTitle,
  hidePublisher,
  disabled,
  member,
  mode,
  defaultIsUserPropertiesMinimised,
  hideUserPropertiesPanel,
  hideEditor,
}: {
  templateId: string;
  hideTitle?: boolean;
  hidePublisher?: boolean;
  disabled?: boolean;
  member?: WorkspaceMemberResource;
  mode?: TemplateEditorMode;
  defaultIsUserPropertiesMinimised?: boolean;
  hideUserPropertiesPanel?: boolean;
  hideEditor?: boolean;
}) {
  return (
    <TemplateEditor
      templateId={messageId}
      channel={ChannelType.MobilePush}
      member={member}
      disabled={disabled}
      hideTitle={hideTitle}
      hidePublisher={hidePublisher}
      renderEditorHeader={() => null}
      renderEditorBody={({ draft, setDraft, disabled: disabledOverride }) => {
        if (draft.type !== ChannelType.MobilePush) {
          return null;
        }
        return (
          <Stack spacing={2} sx={{ padding: 1 }}>
            <TextField
              label="Title"
              variant="outlined"
              fullWidth
              disabled={disabledOverride}
              value={draft.title ?? ""}
              onChange={(e) => {
                setDraft((defn) => {
                  if (defn.type !== ChannelType.MobilePush) {
                    return defn;
                  }
                  return { ...defn, title: e.target.value };
                });
              }}
            />
            <TextField
              label="Body"
              variant="outlined"
              fullWidth
              multiline
              minRows={4}
              disabled={disabledOverride}
              value={draft.body ?? ""}
              onChange={(e) => {
                setDraft((defn) => {
                  if (defn.type !== ChannelType.MobilePush) {
                    return defn;
                  }
                  return { ...defn, body: e.target.value };
                });
              }}
            />
            <TextField
              label="Image URL"
              variant="outlined"
              fullWidth
              disabled={disabledOverride}
              helperText="Optional image displayed in the notification."
              value={draft.imageUrl ?? ""}
              onChange={(e) => {
                setDraft((defn) => {
                  if (defn.type !== ChannelType.MobilePush) {
                    return defn;
                  }
                  return { ...defn, imageUrl: e.target.value || undefined };
                });
              }}
            />
            <TextField
              label="Android Notification Channel ID"
              variant="outlined"
              fullWidth
              disabled={disabledOverride}
              helperText="Optional Android notification channel id."
              value={draft.android?.notification.channelId ?? ""}
              onChange={(e) => {
                setDraft((defn) => {
                  if (defn.type !== ChannelType.MobilePush) {
                    return defn;
                  }
                  return {
                    ...defn,
                    android: {
                      notification: {
                        channelId: e.target.value || undefined,
                      },
                    },
                  };
                });
              }}
            />
          </Stack>
        );
      }}
      renderPreviewHeader={() => null}
      renderPreviewBody={({ rendered }) => (
        <MobilePushPreviewBody
          title={rendered.title}
          body={rendered.body}
          imageUrl={rendered.imageUrl}
        />
      )}
      draftToPreview={draftToPreview}
      fieldToReadable={fieldToReadable}
      mode={mode}
      defaultIsUserPropertiesMinimised={defaultIsUserPropertiesMinimised}
      hideUserPropertiesPanel={hideUserPropertiesPanel}
      hideEditor={hideEditor}
    />
  );
}
