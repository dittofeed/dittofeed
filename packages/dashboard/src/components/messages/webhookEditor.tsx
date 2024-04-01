import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  CompletionStatus,
  RenderMessageTemplateRequestContents,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import R from "remeda";

import TemplateEditor, { DefinitionToPreview } from "../templateEditor";
import { useAppStorePick } from "../../lib/appStore";
import { useMemo } from "react";

function fieldToReadable(field: string) {
  // FIXME
  return null;
}

const definitionToPreview: DefinitionToPreview = (definition) => {
  if (definition.type !== ChannelType.Webhook) {
    throw new Error("Invalid channel type");
  }
  // FIXME
  const content: RenderMessageTemplateRequestContents = {};
  return content;
};

export default function WebhookEditor({
  templateId,
  hideTitle,
  hideSaveButton,
  saveOnUpdate,
  disabled,
  member,
}: {
  templateId: string;
  hideTitle?: boolean;
  hideSaveButton?: boolean;
  saveOnUpdate?: boolean;
  disabled?: boolean;
  member?: WorkspaceMemberResource;
}) {
  const theme = useTheme();
  const { messages: templates, viewDraft } = useAppStorePick([
    "messages",
    "viewDraft",
  ]);
  const template = useMemo(
    () =>
      templates.type === CompletionStatus.Successful
        ? templates.value.find((t) => t.id === templateId)
        : undefined,
    [templates, templateId],
  );
  const definition = viewDraft ? template?.draft : template?.definition;
  const configAndSecretsPayload = useMemo(
    () =>
      definition && definition.type === ChannelType.Webhook
        ? JSON.stringify(R.pick(definition, ["config", "secret"]))
        : "",
    [definition],
  );

  if (!definition || definition.type !== ChannelType.Webhook) {
    return null;
  }

  return (
    <TemplateEditor
      templateId={templateId}
      channel={ChannelType.Sms}
      member={member}
      disabled={disabled}
      hideTitle={hideTitle}
      hideSaveButton={hideSaveButton}
      saveOnUpdate={saveOnUpdate}
      renderEditorHeader={() => null}
      renderEditorBody={({ setDefinition }) => {
        return (
          <ReactCodeMirror
            // FIXME
            value={configAndSecretsPayload}
            onChange={(value) => {
              setDefinition((defn) => {
                if (defn.type !== ChannelType.Webhook) {
                  return defn;
                }
                // FIXME
                return defn;
              });
            }}
            readOnly={disabled}
            extensions={[
              // FIXME json extension
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
      renderPreviewHeader={() => null}
      renderPreviewBody={({ rendered }) => {
        if (!rendered.body) return null;
        return <>FIXME</>;
      }}
      definitionToPreview={definitionToPreview}
      fieldToReadable={fieldToReadable}
    />
  );
}
