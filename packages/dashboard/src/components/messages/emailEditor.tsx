import { html } from "@codemirror/lang-html";
import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Fullscreen, FullscreenExit } from "@mui/icons-material";
import {
  Alert,
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
  EphemeralRequestStatus,
  InternalEventType,
  JsonResultType,
  MessageTemplateResource,
  MessageTemplateTestRequest,
  MessageTemplateTestResponse,
  RenderMessageTemplateRequest,
  RenderMessageTemplateRequestContents,
  RenderMessageTemplateResponse,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { closeSnackbar, enqueueSnackbar } from "notistack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
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
import LoadingModal from "../loadingModal";
import TemplateEditor, { DefinitionToPreview } from "../templateEditor";
import defaultEmailBody from "./defaultEmailBody";

const USER_TO = "{{user.email}}";

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

interface EmailEditorStore {
  messageTestRequest: EphemeralRequestStatus<Error>;
  setMessageTestRequest: (request: EphemeralRequestStatus<Error>) => void;
  testResponse: MessageTemplateTestResponse | null;
  setTestResponse: (response: MessageTemplateTestResponse | null) => void;
}

export const useEmailEditorStore = create(
  immer<EmailEditorStore>((set) => ({
    messageTestRequest: {
      type: CompletionStatus.NotStarted,
    },
    setMessageTestRequest: (request) => {
      set((state) => {
        state.messageTestRequest = request;
      });
    },
    testResponse: null,
    setTestResponse: (response) => {
      set((state) => {
        state.testResponse = response;
      });
    },
  }))
);

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
  const router = useRouter();
  const [errors, setErrors] = useState<Map<NotifyKey, string>>(new Map());
  const [previewBodyHtml, setRenderedBody] = useState<string>("");
  const [previewSubject, setRenderedSubject] = useState<string>("");
  const [previewEmailFrom, setRenderedFrom] = useState<string>("");
  const [previewEmailReplyTo, setRenderedReplyTo] = useState<string>("");
  const {
    apiBase,
    emailMessageBody: emailBody,
    emailMessageFrom: emailFrom,
    emailMessageSubject: emailSubject,
    emailMessageUserProperties: mockUserProperties,
    emailMessageReplyTo,
    setEmailMessageBody: setEmailBody,
    setEmailMessageFrom: setEmailFrom,
    setEmailMessageSubject: setSubject,
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

  const htmlCodeMirrorHandleChange = (val: string) => {
    setEmailBody(val);
  };

  const editorHeader = (
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
  );

  const editorBody = (
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
  );

  const previewHeader = (
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
    </>
  );
  const previewBody = (
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
  );

  // TODO render provider and user
  return (
    <TemplateEditor
      templateId={messageId}
      disabled={disabled}
      hideTitle={hideTitle}
      hideSaveButton={hideSaveButton}
      saveOnUpdate={saveOnUpdate}
      renderEditorHeader={() => editorHeader}
      renderEditorBody={() => editorBody}
      renderPreviewBody={() => previewBody}
      renderPreviewHeader={() => previewHeader}
      definitionToPreview={definitionToPreview}
    />
  );
}
