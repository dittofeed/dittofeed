import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Autocomplete, TextField, useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  CompletionStatus,
  RenderMessageTemplateRequestContents,
  RenderMessageTemplateType,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "../../lib/appStore";
import TemplateEditor, {
  DraftToPreview,
  getDisabledInputStyles,
  TemplateEditorMode,
} from "../templateEditor";
import { WebhookPreviewBody } from "./webhookPreview";

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
      type: RenderMessageTemplateType.PlainText,
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
  mode,
  defaultIsUserPropertiesMinimised,
  hideUserPropertiesPanel,
}: {
  templateId: string;
  hideTitle?: boolean;
  hidePublisher?: boolean;
  disabled?: boolean;
  member?: WorkspaceMemberResource;
  mode?: TemplateEditorMode;
  defaultIsUserPropertiesMinimised?: boolean;
  hideUserPropertiesPanel?: boolean;
}) {
  const theme = useTheme();
  const { userProperties } = useAppStorePick([
    "messages",
    "viewDraft",
    "userProperties",
  ]);

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
        const options =
          userProperties.type === CompletionStatus.Successful
            ? userProperties.value.map((up) => up.name)
            : [];
        return (
          <Autocomplete
            disabled={disabled}
            options={options}
            value={draft.identifierKey}
            autoComplete
            renderInput={(params) => (
              <TextField
                {...params}
                variant="filled"
                label="Identifier Key"
                InputProps={{
                  ...params.InputProps,
                  sx: {
                    fontSize: ".75rem",
                    borderTopRightRadius: 0,
                  },
                }}
              />
            )}
            onChange={(_, value) => {
              if (value) {
                setDraft((defn) => {
                  if (defn.type !== ChannelType.Webhook) {
                    return defn;
                  }
                  defn.identifierKey = value;
                  return defn;
                });
              }
            }}
          />
        );
      }}
      renderEditorBody={({ draft, setDraft }) => {
        if (draft.type !== ChannelType.Webhook) {
          return null;
        }
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
        return <WebhookPreviewBody body={rendered.body} />;
      }}
      draftToPreview={draftToPreview}
      fieldToReadable={fieldToReadable}
      mode={mode}
      defaultIsUserPropertiesMinimised={defaultIsUserPropertiesMinimised}
      hideUserPropertiesPanel={hideUserPropertiesPanel}
    />
  );
}
