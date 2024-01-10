import { html } from "@codemirror/lang-html";
import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Stack, SxProps, TextField, Theme, useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import escapeHTML from "escape-html";
import {
  ChannelType,
  CompletionStatus,
  RenderMessageTemplateRequestContents,
} from "isomorphic-lib/src/types";
import React from "react";

import { EmailMessageEditorState } from "../../lib/types";
import TemplateEditor, { DefinitionToPreview } from "../templateEditor";
import defaultEmailBody from "./defaultEmailBody";

const USER_TO = "{{user.email}}";

export function defaultEmailMessageState(
  id: string
): Omit<
  EmailMessageEditorState,
  "emailMessageUserPropertiesJSON" | "emailMessageUserProperties"
> {
  return {
    emailMessageBody: defaultEmailBody,
    emailMessageTitle: `New Email Message - ${id}`,
    emailMessageSubject: 'Hi {{ user.firstName | default: "there"}}!',
    emailMessageFrom: '{{ user.accountManager | default: "hello@company.com"}}',
    emailMessageReplyTo: "",
    emailMessageUpdateRequest: {
      type: CompletionStatus.NotStarted,
    },
  };
}

function fieldToReadable(field: string) {
  switch (field) {
    case "body":
      return "Body";
    case "from":
      return "From";
    case "subject":
      return "Subject";
    case "replyTo":
      return "Reply-To";
    default:
      return null;
  }
}

const definitionToPreview: DefinitionToPreview = (definition) => {
  if (definition.type !== ChannelType.Email) {
    throw new Error("Invalid channel type");
  }
  const content: RenderMessageTemplateRequestContents = {
    from: {
      value: definition.from,
    },
    subject: {
      value: definition.subject,
    },
    body: {
      mjml: true,
      value: definition.body,
    },
  };
  if (definition.replyTo) {
    content.replyTo = {
      value: definition.replyTo,
    };
  }
  return content;
};

export default function EmailEditor({
  hideSaveButton,
  hideTitle,
  templateId: messageId,
  saveOnUpdate,
  disabled,
}: {
  templateId: string;
  hideSaveButton?: boolean;
  hideTitle?: boolean;
  saveOnUpdate?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const disabledStyles: SxProps<Theme> = {
    "& .MuiInputBase-input.Mui-disabled": {
      WebkitTextFillColor: theme.palette.grey[600],
      color: theme.palette.grey[600],
    },
    '& .MuiFormLabel-root[data-shrink="true"]': {
      color: theme.palette.grey[600],
    },
  };

  // TODO render provider and user
  return (
    <TemplateEditor
      templateId={messageId}
      disabled={disabled}
      hideTitle={hideTitle}
      hideSaveButton={hideSaveButton}
      saveOnUpdate={saveOnUpdate}
      renderEditorHeader={({ definition, setDefinition }) => {
        if (definition.type !== ChannelType.Email) {
          return null;
        }
        return (
          <Stack>
            <TextField
              disabled
              required
              label="To"
              variant="filled"
              value={USER_TO}
              sx={disabledStyles}
              InputProps={{
                sx: {
                  fontSize: ".75rem",
                  borderTopRightRadius: 0,
                },
              }}
            />
            <TextField
              disabled={disabled}
              label="From"
              variant="filled"
              onChange={(e) => {
                setDefinition((defn) => {
                  if (defn.type !== ChannelType.Email) {
                    return defn;
                  }
                  defn.from = e.target.value;
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
              value={definition.from}
            />
            <TextField
              label="Subject"
              required
              disabled={disabled}
              variant="filled"
              onChange={(e) => {
                setDefinition((defn) => {
                  if (defn.type !== ChannelType.Email) {
                    return defn;
                  }
                  defn.subject = e.target.value;
                  return defn;
                });
              }}
              InputProps={{
                sx: {
                  fontSize: ".75rem",
                  borderTopRightRadius: 0,
                },
              }}
              value={definition.subject}
            />
            <TextField
              label="Reply-To"
              variant="filled"
              disabled={disabled}
              onChange={(e) => {
                setDefinition((defn) => {
                  if (defn.type !== ChannelType.Email) {
                    return defn;
                  }
                  defn.replyTo = e.target.value;
                  return defn;
                });
              }}
              InputProps={{
                sx: {
                  fontSize: ".75rem",
                  borderTopRightRadius: 0,
                },
              }}
              value={definition.replyTo ?? ""}
            />
          </Stack>
        );
      }}
      renderEditorBody={({ definition, setDefinition }) => {
        if (definition.type !== ChannelType.Email) {
          return null;
        }
        return (
          <ReactCodeMirror
            value={definition.body}
            onChange={(value) => {
              setDefinition((defn) => {
                if (defn.type !== ChannelType.Email) {
                  return defn;
                }
                defn.body = value;
                return defn;
              });
            }}
            readOnly={disabled}
            extensions={[
              html(),
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
      renderPreviewHeader={({ rendered, userProperties: up }) => (
        <>
          <TextField
            required
            label="To"
            variant="filled"
            disabled
            InputProps={{
              sx: {
                fontSize: ".75rem",
                borderTopLeftRadius: 0,
              },
            }}
            sx={disabledStyles}
            value={escapeHTML(up.email ?? "")}
          />
          <TextField
            required
            label="From"
            variant="filled"
            disabled
            InputProps={{
              sx: {
                fontSize: ".75rem",
                borderTopLeftRadius: 0,
              },
            }}
            sx={disabledStyles}
            value={escapeHTML(rendered.from ?? "")}
          />
          <TextField
            required
            label="Subject"
            variant="filled"
            disabled
            InputProps={{
              sx: {
                fontSize: ".75rem",
                borderTopLeftRadius: 0,
              },
            }}
            sx={disabledStyles}
            value={escapeHTML(rendered.subject ?? "")}
          />
          <TextField
            label="Reply-To"
            variant="filled"
            disabled
            InputProps={{
              sx: {
                fontSize: ".75rem",
                borderTopLeftRadius: 0,
              },
            }}
            sx={disabledStyles}
            value={escapeHTML(rendered.replyTo ?? "")}
          />
        </>
      )}
      renderPreviewBody={({ rendered }) => (
        <iframe
          srcDoc={`<!DOCTYPE html>${rendered.body}`}
          title="email-body-preview"
          style={{
            border: "none",
            height: "100%",
            width: "100%",
            padding: theme.spacing(1),
          }}
        />
      )}
      definitionToPreview={definitionToPreview}
      fieldToReadable={fieldToReadable}
    />
  );
}
