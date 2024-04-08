import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { TextField, useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  CompletionStatus,
  RenderMessageTemplateRequestContents,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import { useMemo } from "react";

import { useAppStorePick } from "../../lib/appStore";
import TemplateEditor, {
  DraftToPreview,
  getDisabledInputStyles,
} from "../templateEditor";

function fieldToReadable(field: string) {
  switch (field) {
    case "body":
      return "Body";
    case "identifierKey":
      return "Identifier Key";
    default:
      return null;
  }
}

const draftToPreview: DraftToPreview = (definition) => {
  if (definition.type !== ChannelType.Webhook) {
    throw new Error("Invalid channel type");
  }
  const content: RenderMessageTemplateRequestContents = {
    body: {
      value: definition.body,
    },
  };
  return content;
};

export default function WebhookEditor({
  templateId,
  hideTitle,
  hidePublisher,
  disabled,
  member,
}: {
  templateId: string;
  hideTitle?: boolean;
  hidePublisher?: boolean;
  disabled?: boolean;
  member?: WorkspaceMemberResource;
}) {
  const theme = useTheme();
  const { messages: templates } = useAppStorePick(["messages", "viewDraft"]);
  const template = useMemo(
    () =>
      templates.type === CompletionStatus.Successful
        ? templates.value.find((t) => t.id === templateId)
        : undefined,
    [templates, templateId],
  );

  if (template?.type !== ChannelType.Webhook) {
    return null;
  }

  return (
    <TemplateEditor
      templateId={templateId}
      channel={ChannelType.Webhook}
      member={member}
      disabled={disabled}
      hideTitle={hideTitle}
      hidePublisher={hidePublisher}
      renderEditorHeader={({ draft, setDraft }) => {
        if (draft.type !== ChannelType.Webhook) {
          return null;
        }
        return (
          <TextField
            disabled={disabled}
            label="Identifier Key"
            variant="filled"
            onChange={(e) => {
              setDraft((defn) => {
                if (defn.type !== ChannelType.Webhook) {
                  return defn;
                }
                defn.identifierKey = e.target.value;
                return defn;
              });
            }}
            required
            InputProps={{
              sx: {
                fontSize: ".75rem",
                borderTopRightRadius: 0,
              },
            }}
            value={draft.identifierKey}
          />
        );
      }}
      renderEditorBody={({ draft, setDraft }) => {
        return (
          <ReactCodeMirror
            value={draft.body}
            onChange={(value) => {
              setDraft((defn) => {
                if (defn.type !== ChannelType.Webhook) {
                  return defn;
                }
                defn.body = value;
                return defn;
              });
            }}
            readOnly={disabled}
            extensions={[
              codeMirrorJson(),
              linter(jsonParseLinter()),
              EditorView.theme({
                "&": {
                  fontFamily: theme.typography.fontFamily,
                },
              }),
              EditorView.lineWrapping,
              lintGutter(),
            ]}
          />
        );
      }}
      renderPreviewHeader={({ draft }) => {
        if (draft.type !== ChannelType.Webhook) {
          return null;
        }
        const disabledStyles = getDisabledInputStyles(theme);

        return (
          <TextField
            required
            label="Identifier Key"
            variant="filled"
            disabled
            InputProps={{
              sx: {
                fontSize: ".75rem",
                borderTopLeftRadius: 0,
              },
            }}
            sx={disabledStyles}
            value={draft.identifierKey}
          />
        );
      }}
      renderPreviewBody={({ rendered }) => {
        if (!rendered.body) return null;

        return (
          <ReactCodeMirror
            value={rendered.body}
            height="100%"
            readOnly
            editable={false}
            extensions={[
              codeMirrorJson(),
              linter(jsonParseLinter()),
              EditorView.lineWrapping,
              EditorView.editable.of(false),
              EditorView.theme({
                "&": {
                  fontFamily: theme.typography.fontFamily,
                },
              }),
              lintGutter(),
            ]}
          />
        );
      }}
      draftToPreview={draftToPreview}
      fieldToReadable={fieldToReadable}
    />
  );
}
