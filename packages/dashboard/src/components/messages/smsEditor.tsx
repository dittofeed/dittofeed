import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Box, Stack, useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  RenderMessageTemplateRequestContents,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import React from "react";

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
      renderPreviewBody={({ rendered }) => (
        <Stack
          sx={{
            width: "100%",
            height: "100%",
            padding: 1,
            overflow: "hidden",
          }}
          direction="row"
          justifyContent="center"
          alignContent="center"
        >
          <Stack
            sx={{
              height: "60rem",
              width: "24rem",
              backgroundImage:
                "url(https://storage.googleapis.com/dittofeed-public/sms-box.svg)",
              backgroundRepeat: "no-repeat",
              backgroundSize: "contain",
              backgroundPosition: "50% 0%",
              justifyContent: "start",
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                width: "80%",
                marginTop: 14,
                backgroundColor: "#f7f8fa",
                border: "1px solid #ebecf2",
                padding: 1,
                borderRadius: 1,
                whiteSpace: "normal", // Ensures text wraps onto the next line
                wordWrap: "break-word", // Breaks the word at the end of the line
              }}
            >
              {rendered.body}
            </Box>
          </Stack>
        </Stack>
      )}
      definitionToPreview={definitionToPreview}
      fieldToReadable={fieldToReadable}
    />
  );
}
