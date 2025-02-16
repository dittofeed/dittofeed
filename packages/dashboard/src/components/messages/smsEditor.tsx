import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  RenderMessageTemplateRequestContents,
  RenderMessageTemplateType,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import React from "react";

import SmsPreviewBody from "../smsPreviewBody";
import TemplateEditor, {
  DraftToPreview,
  RenderTemplateRequest,
  TemplateEditorMode,
} from "../templateEditor";

function fieldToReadable(field: string) {
  switch (field) {
    case "body":
      return "Body";
    default:
      return null;
  }
}

const draftToPreview: DraftToPreview = (definition) => {
  if (definition.type !== ChannelType.Sms) {
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

export default function SmsEditor({
  templateId: messageId,
  hideTitle,
  hidePublisher,
  disabled,
  member,
  mode,
  renderTemplateRequest,
}: {
  templateId: string;
  hideTitle?: boolean;
  hidePublisher?: boolean;
  disabled?: boolean;
  member?: WorkspaceMemberResource;
  mode?: TemplateEditorMode;
  renderTemplateRequest?: RenderTemplateRequest;
}) {
  const theme = useTheme();

  return (
    <TemplateEditor
      templateId={messageId}
      channel={ChannelType.Sms}
      member={member}
      disabled={disabled}
      hideTitle={hideTitle}
      hidePublisher={hidePublisher}
      renderEditorHeader={() => null}
      renderEditorBody={({ draft, setDraft }) => {
        if (draft.type !== ChannelType.Sms) {
          return null;
        }
        return (
          <ReactCodeMirror
            value={draft.body}
            onChange={(value) => {
              setDraft((defn) => {
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
      draftToPreview={draftToPreview}
      fieldToReadable={fieldToReadable}
      mode={mode}
      renderTemplateRequest={renderTemplateRequest}
    />
  );
}
