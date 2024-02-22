import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  RenderMessageTemplateRequestContents,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import React from "react";

import SmsPreviewBody from "../smsPreviewBody";
import TemplateEditor, { DefinitionToPreview } from "../templateEditor";

function fieldToReadable(field: string) {
  switch (field) {
    case "body":
      return "Body";
    default:
      return null;
  }
}

const definitionToPreview: DefinitionToPreview = (definition) => {
  if (definition.type !== ChannelType.Sms) {
    throw new Error("Invalid channel type");
  }
  const content: RenderMessageTemplateRequestContents = {
    body: {
      value: definition.body,
    },
  };
  return content;
};

export default function SmsEditor({
  templateId: messageId,
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

  return (
    <TemplateEditor
      templateId={messageId}
      channel={ChannelType.Sms}
      member={member}
      disabled={disabled}
      hideTitle={hideTitle}
      hideSaveButton={hideSaveButton}
      saveOnUpdate={saveOnUpdate}
      renderEditorHeader={() => null}
      renderEditorBody={({ definition, setDefinition }) => {
        if (definition.type !== ChannelType.Sms) {
          return null;
        }
        return (
          <ReactCodeMirror
            value={definition.body}
            onChange={(value) => {
              setDefinition((defn) => {
                if (defn.type !== ChannelType.Sms) {
                  return defn;
                }
                defn.body = value;
                return defn;
              });
            }}
            readOnly={disabled}
            extensions={[
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
        return <SmsPreviewBody body={rendered.body} />;
      }}
      definitionToPreview={definitionToPreview}
      fieldToReadable={fieldToReadable}
    />
  );
}
