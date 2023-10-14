import { html } from "@codemirror/lang-html";
import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Fullscreen, FullscreenExit } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  Divider,
  FormLabel,
  IconButton,
  Slide,
  Stack,
  styled,
  SxProps,
  TextField,
  Theme,
  Typography,
  useTheme,
} from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import ReactCodeMirror from "@uiw/react-codemirror";
import axios from "axios";
import escapeHtml from "escape-html";
import hash from "fnv1a";
import { produce } from "immer";
import {
  ChannelType,
  CompletionStatus,
  EmailTemplateResource,
  JsonResultType,
  MessageTemplateResource,
  RenderMessageTemplateRequest,
  RenderMessageTemplateResponse,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { closeSnackbar, enqueueSnackbar } from "notistack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { shallow } from "zustand/shallow";

import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import {
  noticeAnchorOrigin as anchorOrigin,
  noticeAnchorOrigin,
} from "../../lib/notices";
import { AppContents, EmailMessageEditorState } from "../../lib/types";
import { useUpdateEffect } from "../../lib/useUpdateEffect";
import EditableName from "../editableName";
import InfoTooltip from "../infoTooltip";
import defaultEmailBody from "./defaultEmailBody";

function TransitionInner(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
}

const Transition = React.forwardRef(TransitionInner);

const USER_TO = "{{user.email}}";
const USER_PROPERTIES_TOOLTIP =
  "Edit an example user's properties to see the edits reflected in the rendered template. Properties are computed from user Identify traits and Track events.";

export const defaultInitialUserProperties = {
  email: "test@email.com",
  id: "ad44fb62-91a4-4ec7-be24-7f9364e331b1",
  phone: "2025550161",
  language: "en-US",
  anonymousId: "0b0d3a71-0a86-4e60-892a-d27f0b290c81",
};

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

const BodyBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== "direction",
})<{ direction: "left" | "right" } & React.ComponentProps<typeof Box>>(
  ({ theme, direction }) => ({
    flex: 1,
    flexBasis: 0,
    overflow: "scroll",
    border: `1px solid ${theme.palette.grey[200]}`,
    ...(direction === "left"
      ? {
          borderTopLeftRadius: theme.shape.borderRadius * 1,
          borderBottomLeftRadius: theme.shape.borderRadius * 1,
        }
      : {
          borderTopRightRadius: theme.shape.borderRadius * 1,
          borderBottomRightRadius: theme.shape.borderRadius * 1,
        }),
  })
);

function upsert({
  workspaceId,
  messageId,
  emailFrom,
  emailBody,
  emailSubject,
  emailMessageReplyTo,
  apiBase,
  emailMessageUpdateRequest,
  setEmailMessageUpdateRequest,
  emailMessageTitle,
  upsertMessage,
}: {
  workspaceId?: string;
  messageId: string | null;
  emailMessageTitle: string;
  emailFrom: string;
  emailBody: string;
  emailSubject: string;
  emailMessageReplyTo: string;
  apiBase: string;
  upsertMessage: AppContents["upsertMessage"];
  emailMessageUpdateRequest: AppContents["emailMessageUpdateRequest"];
  setEmailMessageUpdateRequest: AppContents["setEmailMessageUpdateRequest"];
}) {
  if (
    !workspaceId ||
    !messageId ||
    emailMessageTitle.length === 0 ||
    emailBody.length === 0 ||
    emailSubject.length === 0
  ) {
    return;
  }
  const upsertEmailDefinition: EmailTemplateResource = {
    type: ChannelType.Email,
    from: emailFrom,
    body: emailBody,
    subject: emailSubject,
  };

  const updateData: UpsertMessageTemplateResource = {
    id: messageId,
    workspaceId,
    name: emailMessageTitle,
    definition: upsertEmailDefinition,
  };

  if (emailMessageReplyTo.length) {
    upsertEmailDefinition.replyTo = emailMessageReplyTo;
  }

  apiRequestHandlerFactory({
    request: emailMessageUpdateRequest,
    setRequest: setEmailMessageUpdateRequest,
    responseSchema: MessageTemplateResource,
    setResponse: upsertMessage,
    onSuccessNotice: `Saved template.`,
    onFailureNoticeHandler: () => `API Error: Failed to save template.`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/content/templates`,
      data: updateData,
      headers: {
        "Content-Type": "application/json",
      },
    },
  })();
}

type Fullscreen = "editor" | "preview" | null;

enum NotifyKey {
  RenderBodyError = "RenderBodyError",
  RenderFromError = "RenderFromError",
  RenderSubjectError = "RenderSubjectError",
  RenderReplyToError = "RenderReplyToError",
  UserPropertyWarning = "UserPropertyWarning",
}

function errorHash(key: NotifyKey, message: string) {
  return hash(`${key}-${message}`);
}

const errorBodyHtml = '<div style="color:red;">Render Error</div>';

export default function EmailEditor({
  hideSaveButton,
  hideTitle,
  templateId: messageId,
  saveOnUpdate,
  sx,
  disabled,
}: {
  templateId: string;
  hideSaveButton?: boolean;
  hideTitle?: boolean;
  saveOnUpdate?: boolean;
  sx?: SxProps<Theme>;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [errors, setErrors] = useState<Map<NotifyKey, string>>(new Map());
  const [previewBodyHtml, setRenderedBody] = useState<string>("");
  const [previewSubject, setRenderedSubject] = useState<string>("");
  const [previewEmailFrom, setRenderedFrom] = useState<string>("");
  const [previewEmailReplyTo, setRenderedReplyTo] = useState<string>("");

  const [fullscreen, setFullscreen] = useState<Fullscreen>(null);
  const {
    apiBase,
    emailMessageBody: emailBody,
    emailMessageFrom: emailFrom,
    emailMessageSubject: emailSubject,
    emailMessageTitle,
    emailMessageUpdateRequest,
    emailMessageUserProperties: mockUserProperties,
    emailMessageUserPropertiesJSON: userPropertiesJSON,
    emailMessageReplyTo,
    replaceEmailMessageProps: replaceUserProperties,
    setEmailMessageBody: setEmailBody,
    setEmailMessageFrom: setEmailFrom,
    setEmailMessageTitle,
    setEmailMessagePropsJSON: setUserPropertiesJSON,
    setEmailMessageSubject: setSubject,
    setEmailMessageUpdateRequest,
    upsertMessage,
    userProperties,
    setEmailMessageReplyTo,
    workspace: workspaceRequest,
  } = useAppStore(
    (state) => ({
      apiBase: state.apiBase,
      emailMessageBody: state.emailMessageBody,
      emailMessageFrom: state.emailMessageFrom,
      emailMessageSubject: state.emailMessageSubject,
      emailMessageTitle: state.emailMessageTitle,
      emailMessageUpdateRequest: state.emailMessageUpdateRequest,
      emailMessageUserProperties: state.emailMessageUserProperties,
      emailMessageUserPropertiesJSON: state.emailMessageUserPropertiesJSON,
      emailMessageReplyTo: state.emailMessageReplyTo,
      replaceEmailMessageProps: state.replaceEmailMessageProps,
      setEmailMessageBody: state.setEmailMessageBody,
      setEmailMessageFrom: state.setEmailMessageFrom,
      setEmailMessageTitle: state.setEmailMessageTitle,
      setEmailMessageReplyTo: state.setEmailMessageReplyTo,
      setEmailMessagePropsJSON: state.setEmailMessagePropsJSON,
      setEmailMessageSubject: state.setEmailMessageSubject,
      setEmailMessageUpdateRequest: state.setEmailMessageUpdateRequest,
      upsertMessage: state.upsertMessage,
      userProperties: state.userProperties,
      workspace: state.workspace,
    }),
    shallow
  );

  const userPropertySet: Set<string> = useMemo(
    () =>
      new Set(
        userProperties.type === CompletionStatus.Successful
          ? new Set(userProperties.value.map((up) => up.name))
          : []
      ),
    [userProperties]
  );

  const workspace =
    workspaceRequest.type === CompletionStatus.Successful
      ? workspaceRequest.value
      : null;

  const handleEditorFullscreenOpen = () => {
    setFullscreen("editor");
  };

  const handleFullscreenClose = () => {
    setFullscreen(null);
  };

  const handlePreviewFullscreenOpen = () => {
    setFullscreen("preview");
  };

  const disabledStyles: SxProps<Theme> = {
    "& .MuiInputBase-input.Mui-disabled": {
      WebkitTextFillColor: theme.palette.grey[600],
      color: theme.palette.grey[600],
    },
    '& .MuiFormLabel-root[data-shrink="true"]': {
      color: theme.palette.grey[600],
    },
  };

  const [debouncedEmailBody] = useDebounce(emailBody, 300);
  const [debouncedEmailSubject] = useDebounce(emailSubject, 300);
  const [debouncedUserProperties] = useDebounce(mockUserProperties, 300);
  const [debouncedEmailFrom] = useDebounce(emailFrom, 300);
  const [debouncedReplyTo] = useDebounce(emailMessageReplyTo, 300);

  useEffect(() => {
    const exitingFunction = () => {
      errors.forEach((e, key) => {
        closeSnackbar(errorHash(key, e));
      });
    };

    router.events.on("routeChangeStart", exitingFunction);

    return () => {
      router.events.off("routeChangeStart", exitingFunction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  const previewEmailTo = debouncedUserProperties.email;

  useEffect(() => {
    (async () => {
      if (!workspace) {
        return;
      }

      const data: RenderMessageTemplateRequest = {
        workspaceId: workspace.id,
        channel: ChannelType.Email,
        userProperties: debouncedUserProperties,
        contents: {
          from: {
            value: debouncedEmailFrom,
          },
          subject: {
            value: debouncedEmailSubject,
          },
          body: {
            mjml: true,
            value: debouncedEmailBody,
          },
        },
      };
      if (debouncedReplyTo.length) {
        data.contents.replyTo = {
          value: debouncedReplyTo,
        };
      }

      try {
        const response = await axios({
          method: "POST",
          url: `${apiBase}/api/content/templates/render`,
          data,
        });

        const { contents } = response.data as RenderMessageTemplateResponse;
        for (const contentKey in contents) {
          const content = contents[contentKey];
          if (content === undefined) {
            continue;
          }
          let setter: ((value: string) => void) | null = null;
          let errorKey: NotifyKey | null = null;

          switch (contentKey) {
            case "body":
              setter = setRenderedBody;
              errorKey = NotifyKey.RenderBodyError;
              break;
            case "subject":
              setter = (c: string) => setRenderedSubject(escapeHtml(c));
              errorKey = NotifyKey.RenderSubjectError;
              break;
            case "from":
              setter = (c: string) => setRenderedFrom(escapeHtml(c));
              errorKey = NotifyKey.RenderFromError;
              break;
            case "replyTo":
              setter = (c: string) => setRenderedReplyTo(escapeHtml(c));
              errorKey = NotifyKey.RenderReplyToError;
              break;
          }

          if (errorKey && setter) {
            const existingErr = errors.get(errorKey);

            if (content.type === JsonResultType.Ok) {
              if (existingErr) {
                closeSnackbar(errorHash(errorKey, existingErr));
              }
              setter(content.value);
              setErrors(
                produce((errorMap) => {
                  if (errorKey) {
                    errorMap.delete(errorKey);
                  }
                })
              );
            } else {
              let message: string;
              switch (errorKey) {
                case NotifyKey.RenderBodyError:
                  message = `Body Error: ${content.err}`;
                  break;
                case NotifyKey.RenderSubjectError:
                  message = `Subject Error: ${content.err}`;
                  break;
                case NotifyKey.RenderFromError:
                  message = `From Error: ${content.err}`;
                  break;
                case NotifyKey.RenderReplyToError:
                  message = `Reply-To Error: ${content.err}`;
                  break;
              }

              if (existingErr && existingErr !== message) {
                closeSnackbar(errorHash(errorKey, existingErr));
              }

              enqueueSnackbar(message, {
                variant: "error",
                persist: true,
                key: errorHash(errorKey, message),
                anchorOrigin,
              });
              setErrors(
                produce((errorMap) => {
                  if (errorKey) {
                    errorMap.set(errorKey, message);
                  }
                })
              );
            }
          }
        }
      } catch (e) {
        console.error(e);
        enqueueSnackbar("API Error: failed to render template preview.", {
          variant: "error",
          autoHideDuration: 3000,
          anchorOrigin: noticeAnchorOrigin,
        });
      }
    })();
  }, [
    apiBase,
    debouncedEmailBody,
    debouncedEmailFrom,
    debouncedReplyTo,
    debouncedEmailSubject,
    debouncedUserProperties,
    errors,
    workspace,
  ]);

  useEffect(() => {
    let missingUserProperty: string | null = null;
    for (const userProperty in mockUserProperties) {
      if (!userPropertySet.has(userProperty)) {
        missingUserProperty = userProperty;
        break;
      }
    }
    const existingMsg = errors.get(NotifyKey.UserPropertyWarning);
    if (!missingUserProperty) {
      if (existingMsg) {
        closeSnackbar(errorHash(NotifyKey.UserPropertyWarning, existingMsg));
      }

      setErrors(
        produce((errorMap) => {
          errorMap.delete(NotifyKey.UserPropertyWarning);
        })
      );
      return;
    }

    const message = `User property named "${missingUserProperty}" is not configured.`;
    if (existingMsg && existingMsg !== message) {
      closeSnackbar(errorHash(NotifyKey.UserPropertyWarning, existingMsg));
    }
    enqueueSnackbar(message, {
      variant: "warning",
      persist: true,
      key: errorHash(NotifyKey.UserPropertyWarning, message),
      anchorOrigin,
    });
    setErrors(
      produce((errorMap) => {
        errorMap.set(NotifyKey.UserPropertyWarning, message);
      })
    );

    setRenderedBody(errorBodyHtml);
  }, [errors, mockUserProperties, userPropertySet]);

  const handleSave = useCallback(() => {
    if (disabled) {
      return;
    }
    upsert({
      workspaceId: workspace?.id,
      messageId,
      emailBody: debouncedEmailBody,
      emailFrom: debouncedEmailFrom,
      emailSubject: debouncedEmailSubject,
      emailMessageReplyTo: debouncedReplyTo,
      emailMessageUpdateRequest,
      setEmailMessageUpdateRequest,
      upsertMessage,
      apiBase,
      emailMessageTitle,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // README don't update on emailMessageUpdateRequest change
    apiBase,
    disabled,
    debouncedEmailBody,
    debouncedEmailFrom,
    debouncedEmailSubject,
    debouncedReplyTo,
    emailMessageTitle,
    messageId,
    setEmailMessageUpdateRequest,
    upsertMessage,
    workspace?.id,
  ]);

  useUpdateEffect(() => {
    if (!saveOnUpdate) {
      return;
    }
    handleSave();
  }, [handleSave, saveOnUpdate]);

  if (!workspace || !messageId) {
    return null;
  }

  const htmlCodeMirrorHandleChange = (val: string) => {
    setEmailBody(val);
  };

  const jsonCodeMirrorHandleChange = (val: string) => {
    setUserPropertiesJSON(val);
    try {
      const parsed = JSON.parse(val);
      if (!(typeof parsed === "object" && parsed !== null)) {
        return;
      }
      const parsedObj: Record<string, unknown> = parsed;
      const props: Record<string, string> = {};

      // eslint-disable-next-line guard-for-in
      for (const key in parsedObj) {
        const parsedVal = parsed[key];
        if (typeof parsedVal !== "string") {
          continue;
        }
        props[key] = parsedVal;
      }
      replaceUserProperties(props);
      // eslint-disable-next-line no-empty
    } catch (e) {}
  };

  const editor = (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
      spacing={1}
    >
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
            setEmailFrom(e.target.value);
          }}
          required
          InputProps={{
            sx: {
              fontSize: ".75rem",
              borderTopRightRadius: 0,
            },
          }}
          value={emailFrom}
        />
        <TextField
          label="Subject"
          required
          disabled={disabled}
          variant="filled"
          onChange={(e) => {
            setSubject(e.target.value);
          }}
          InputProps={{
            sx: {
              fontSize: ".75rem",
              borderTopRightRadius: 0,
            },
          }}
          value={emailSubject}
        />
        <TextField
          label="Reply-To"
          variant="filled"
          disabled={disabled}
          onChange={(e) => {
            setEmailMessageReplyTo(e.target.value);
          }}
          InputProps={{
            sx: {
              fontSize: ".75rem",
              borderTopRightRadius: 0,
            },
          }}
          value={emailMessageReplyTo}
        />
      </Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <FormLabel sx={{ paddingLeft: 1 }}>Body Message</FormLabel>
        {fullscreen === null ? (
          <IconButton size="small" onClick={handleEditorFullscreenOpen}>
            <Fullscreen />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={handleFullscreenClose}>
            <FullscreenExit />
          </IconButton>
        )}
      </Stack>

      <BodyBox sx={{ padding: 1, fontFamily: "monospace" }} direction="left">
        <ReactCodeMirror
          value={emailBody}
          onChange={htmlCodeMirrorHandleChange}
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
      </BodyBox>
    </Stack>
  );

  const preview = (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
      spacing={1}
    >
      <Stack>
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
          value={previewEmailTo}
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
          value={previewEmailFrom}
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
          value={previewSubject}
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
          value={previewEmailReplyTo}
        />
      </Stack>

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <FormLabel sx={{ paddingLeft: 1 }}>Body Preview</FormLabel>
        {fullscreen === null ? (
          <IconButton size="small" onClick={handlePreviewFullscreenOpen}>
            <Fullscreen />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={handleFullscreenClose}>
            <FullscreenExit />
          </IconButton>
        )}
      </Stack>
      <BodyBox direction="right">
        {/* TODO use window postmessage to re-render */}
        <iframe
          srcDoc={`<!DOCTYPE html>${previewBodyHtml}`}
          title="email-body-preview"
          style={{
            border: "none",
            height: "100%",
            width: "100%",
            padding: theme.spacing(1),
          }}
        />
      </BodyBox>
    </Stack>
  );

  return (
    <>
      <Stack
        direction="row"
        sx={{
          ...sx,
          width: "100%",
          paddingRight: 2,
          paddingTop: 2,
        }}
        spacing={1}
      >
        <Stack
          direction="column"
          spacing={2}
          sx={{
            borderTopRightRadius: 1,
            width: "25%",
            padding: 1,
            border: `1px solid ${theme.palette.grey[200]}`,
            boxShadow: theme.shadows[2],
          }}
        >
          {!hideTitle && (
            <EditableName
              name={emailMessageTitle}
              variant="h4"
              onChange={(e) => {
                setEmailMessageTitle(e.target.value);
              }}
            />
          )}
          <InfoTooltip title={USER_PROPERTIES_TOOLTIP}>
            <Typography variant="h5">User Properties</Typography>
          </InfoTooltip>
          <ReactCodeMirror
            value={userPropertiesJSON}
            onChange={jsonCodeMirrorHandleChange}
            extensions={[
              codeMirrorJson(),
              linter(jsonParseLinter()),
              EditorView.lineWrapping,
              EditorView.theme({
                "&": {
                  fontFamily: theme.typography.fontFamily,
                },
              }),
              lintGutter(),
            ]}
          />
          {!hideSaveButton && (
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={errors.size > 0}
            >
              Save
            </Button>
          )}
        </Stack>
        <Stack direction="row" sx={{ flex: 1 }}>
          <Box
            sx={{
              width: "50%",
            }}
          >
            {editor}
          </Box>
          <Divider orientation="vertical" />
          <Box
            sx={{
              width: "50%",
            }}
          >
            {preview}
          </Box>
        </Stack>
      </Stack>
      <Dialog
        fullScreen
        open={fullscreen === "editor"}
        onClose={handleFullscreenClose}
        TransitionComponent={Transition}
      >
        {editor}
      </Dialog>
      <Dialog
        fullScreen
        open={fullscreen === "preview"}
        onClose={handleFullscreenClose}
        TransitionComponent={Transition}
      >
        {preview}
      </Dialog>
    </>
  );
}
