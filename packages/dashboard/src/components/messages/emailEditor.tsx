import { html } from "@codemirror/lang-html";
import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  SxProps,
  TextField,
  Theme,
  useTheme,
} from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  CompletionStatus,
  RenderMessageTemplateRequestContents,
  UserPropertyDefinitionType,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useMemo } from "react";

import { useAppStorePick } from "../../lib/appStore";
import EmailPreviewHeader from "../emailPreviewHeader";
import TemplateEditor, {
  DraftToPreview,
  RenderEditorParams,
} from "../templateEditor";

const USER_TO = "{{user.email}}";

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

function EmailOptions({ draft, setDraft, disabled }: RenderEditorParams) {
  const [open, setOpen] = React.useState(false);
  const { userProperties } = useAppStorePick(["userProperties"]);
  const options = useMemo(() => {
    if (userProperties.type !== CompletionStatus.Successful) {
      return [];
    }
    return userProperties.value
      .filter((up) => up.definition.type === UserPropertyDefinitionType.File)
      .map((up) => up.name);
  }, [userProperties]);

  const addCustomHeader = () => {
    setDraft((defn) => {
      if (defn.type !== ChannelType.Email) {
        return defn;
      }
      const headers = defn.headers ?? [];
      return {
        ...defn,
        headers: [...headers, { name: "", value: "" }],
      };
    });
  };

  const updateCustomHeader = (
    index: number,
    field: "name" | "value",
    value: string,
  ) => {
    setDraft((defn) => {
      if (defn.type !== ChannelType.Email) {
        return defn;
      }
      const headers = defn.headers ? [...defn.headers] : [];
      const existing = headers[index];
      headers[index] = {
        name: field === "name" ? value : existing?.name ?? "",
        value: field === "value" ? value : existing?.value ?? "",
      };
      return { ...defn, headers };
    });
  };

  const removeCustomHeader = (index: number) => {
    setDraft((defn) => {
      if (defn.type !== ChannelType.Email) {
        return defn;
      }
      const headers = (defn.headers ?? []).filter((_, i) => i !== index);
      return { ...defn, headers };
    });
  };

  if (draft.type !== ChannelType.Email) {
    return null;
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}> Options </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle> Email Options </DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ p: 1 }}
            filterSelectedOptions
            value={draft.attachmentUserProperties ?? []}
            renderTags={(value: readonly string[], getTagProps) =>
              value.map((option: string, index: number) => {
                const { key, ...tagProps } = getTagProps({ index });
                const id =
                  userProperties.type === CompletionStatus.Successful
                    ? userProperties.value.find((up) => up.name === option)?.id
                    : undefined;

                if (!id) {
                  return null;
                }
                return (
                  <Chip
                    clickable
                    component={Link}
                    href={`/user-properties/${id}`}
                    label={option}
                    key={key}
                    {...tagProps}
                  />
                );
              })
            }
            onChange={(_event, value) => {
              setDraft((defn) => {
                if (defn.type !== ChannelType.Email) {
                  return defn;
                }
                return { ...defn, attachmentUserProperties: value };
              });
            }}
            options={options}
            disabled={disabled}
            multiple
            renderInput={(params) => (
              <TextField {...params} label="Attachments" variant="outlined" />
            )}
          />

          <Button
            startIcon={<AddIcon />}
            onClick={addCustomHeader}
            disabled={disabled}
            sx={{ mt: 2, mb: 1 }}
          >
            Add Custom Header
          </Button>

          <Stack
            spacing={2}
            sx={{
              maxHeight: "200px",
              overflowY: "auto",
              width: "100%",
              pt: 1,
              pr: 1,
            }}
          >
            {(draft.headers ?? []).map((header, index) => (
              <Stack
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                direction="row"
                spacing={2}
                sx={{ width: "100%" }}
                alignItems="center"
              >
                <TextField
                  label="Header Name"
                  value={header.name}
                  sx={{ flex: 1 }}
                  onChange={(e) =>
                    updateCustomHeader(index, "name", e.target.value)
                  }
                  disabled={disabled}
                  size="small"
                />
                <TextField
                  sx={{ flex: 1 }}
                  label="Header Value"
                  value={header.value}
                  onChange={(e) =>
                    updateCustomHeader(index, "value", e.target.value)
                  }
                  disabled={disabled}
                  size="small"
                />
                <IconButton
                  onClick={() => removeCustomHeader(index)}
                  disabled={disabled}
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

const draftToPreview: DraftToPreview = (definition) => {
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
  hideTitle,
  templateId: messageId,
  hidePublisher,
  disabled,
  member,
}: {
  templateId: string;
  hidePublisher?: boolean;
  hideTitle?: boolean;
  disabled?: boolean;
  member?: WorkspaceMemberResource;
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

  return (
    <TemplateEditor
      templateId={messageId}
      channel={ChannelType.Email}
      member={member}
      disabled={disabled}
      hideTitle={hideTitle}
      hidePublisher={hidePublisher}
      renderEditorOptions={(params) => <EmailOptions {...params} />}
      renderEditorHeader={({ draft, setDraft }) => {
        if (draft.type !== ChannelType.Email) {
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
                setDraft((defn) => {
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
              value={draft.from}
            />
            <TextField
              label="Subject"
              required
              disabled={disabled}
              variant="filled"
              onChange={(e) => {
                setDraft((defn) => {
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
              value={draft.subject}
            />
            <TextField
              label="Reply-To"
              variant="filled"
              disabled={disabled}
              onChange={(e) => {
                setDraft((defn) => {
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
              value={draft.replyTo ?? ""}
            />
          </Stack>
        );
      }}
      renderEditorBody={({ draft, setDraft, disabled: disabledOverride }) => {
        if (draft.type !== ChannelType.Email) {
          return null;
        }
        return (
          <ReactCodeMirror
            value={draft.body}
            onChange={(value) => {
              setDraft((defn) => {
                if (defn.type !== ChannelType.Email) {
                  return defn;
                }

                defn.body = value;
                return defn;
              });
            }}
            readOnly={disabledOverride}
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
        <EmailPreviewHeader
          email={up.email}
          from={rendered.from}
          subject={rendered.subject}
          replyTo={rendered.replyTo}
        />
      )}
      renderPreviewBody={({ rendered }) => (
        <iframe
          srcDoc={`<!DOCTYPE html>${rendered.body ?? ""}`}
          title="email-body-preview"
          style={{
            border: "none",
            height: "100%",
            width: "100%",
            padding: theme.spacing(1),
          }}
        />
      )}
      draftToPreview={draftToPreview}
      fieldToReadable={fieldToReadable}
    />
  );
}
