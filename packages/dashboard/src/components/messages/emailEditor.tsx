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
  SnackbarOrigin,
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
import axios, { AxiosResponse } from "axios";
import escapeHtml from "escape-html";
import hash from "fnv1a";
import { produce } from "immer";
import { renderWithUserProperties } from "isomorphic-lib/src/liquid";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  MessageTemplateResource,
  TemplateResourceType,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { closeSnackbar, enqueueSnackbar } from "notistack";
import React, { useEffect, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";

import { useAppStore } from "../../lib/appStore";
import { EmailMessageEditorState } from "../../lib/types";
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

const initialUserProperties = {
  email: "test@email.com",
  firstName: "Joe",
  id: "ad44fb62-91a4-4ec7-be24-7f9364e331b1",
};

export const defaultEmailMessageState: EmailMessageEditorState = {
  emailMessageBody: defaultEmailBody,
  emailMessageTitle: "New Email Message",
  emailMessageSubject: 'Hi {{ user.firstName | default: "there"}}!',
  emailMessageFrom: '{{ user.accountManager | default: "hello@company.com"}}',
  emailMessageUserProperties: initialUserProperties,
  emailMessageUserPropertiesJSON: JSON.stringify(
    initialUserProperties,
    null,
    2
  ),
  emailMessageUpdateRequest: {
    type: CompletionStatus.NotStarted,
  },
};

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

type Fullscreen = "editor" | "preview" | null;

enum NotifyKey {
  RenderBodyError = "RenderBodyError",
  RenderFromError = "RenderFromError",
  RenderSubjectError = "RenderSubjectError",
  UserPropertyWarning = "UserPropertyWarning",
}

const anchorOrigin: SnackbarOrigin = {
  vertical: "bottom",
  horizontal: "right",
};

function errorHash(key: NotifyKey, message: string) {
  return hash(`${key}-${message}`);
}

const errorBodyHtml = '<div style="color:red;">Render Error</div>';

export default function EmailEditor() {
  const theme = useTheme();
  const path = useRouter();
  const [errors, setErrors] = useState<Map<NotifyKey, string>>(new Map());
  const [previewBodyHtml, setRenderedBody] = useState<string>("");
  const [previewSubject, setRenderedSubject] = useState<string>("");
  const [previewEmailFrom, setRenderedFrom] = useState<string>("");

  const [fullscreen, setFullscreen] = useState<Fullscreen>(null);
  const userProperties = useAppStore((state) => state.userProperties);
  const userPropertySet: Set<string> = useMemo(
    () =>
      new Set(
        userProperties.type === CompletionStatus.Successful
          ? new Set(userProperties.value.map((up) => up.name))
          : []
      ),
    [userProperties]
  );
  const title = useAppStore((state) => state.emailMessageTitle);
  const setTitle = useAppStore((state) => state.setEmailMessageProps);
  const emailSubject = useAppStore((state) => state.emailMessageSubject);
  const workspaceRequest = useAppStore((store) => store.workspace);
  const mockUserProperties = useAppStore(
    (state) => state.emailMessageUserProperties
  );
  const setSubject = useAppStore((state) => state.setEmailMessageSubject);
  const setEmailBody = useAppStore((state) => state.setEmailMessageBody);
  const setEmailFrom = useAppStore((state) => state.setEmailMessageFrom);
  const setEmailMessageUpdateRequest = useAppStore(
    (state) => state.setEmailMessageUpdateRequest
  );
  const upsertMessage = useAppStore((state) => state.upsertMessage);
  const emailMessageUpdateRequest = useAppStore(
    (state) => state.emailMessageUpdateRequest
  );
  const emailFrom = useAppStore((state) => state.emailMessageFrom);
  const emailBody = useAppStore((state) => state.emailMessageBody);
  const apiBase = useAppStore((state) => state.apiBase);
  const userPropertiesJSON = useAppStore(
    (state) => state.emailMessageUserPropertiesJSON
  );
  const setUserPropertiesJSON = useAppStore(
    (state) => state.setEmailMessagePropsJSON
  );
  const replaceUserProperties = useAppStore(
    (state) => state.replaceEmailMessageProps
  );

  const messageId = typeof path.query.id === "string" ? path.query.id : null;
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

  useEffect(() => {
    const existingErr = errors.get(NotifyKey.RenderBodyError);
    try {
      const rendered = renderWithUserProperties({
        template: debouncedEmailBody,
        userProperties: debouncedUserProperties,
      });
      if (existingErr) {
        closeSnackbar(errorHash(NotifyKey.RenderBodyError, existingErr));
      }
      setRenderedBody(rendered);
      setErrors(
        produce((errorMap) => {
          errorMap.delete(NotifyKey.RenderBodyError);
        })
      );
    } catch (e) {
      const message = `Body Error: ${String(e)}`;
      if (existingErr && existingErr !== message) {
        closeSnackbar(errorHash(NotifyKey.RenderBodyError, existingErr));
      }
      enqueueSnackbar(message, {
        variant: "error",
        persist: true,
        key: errorHash(NotifyKey.RenderBodyError, message),
        anchorOrigin,
      });
      setErrors(
        produce((errorMap) => {
          errorMap.set(NotifyKey.RenderBodyError, message);
        })
      );

      setRenderedBody(errorBodyHtml);
    }
  }, [debouncedEmailBody, debouncedUserProperties, errors]);

  useEffect(() => {
    const existingErr = errors.get(NotifyKey.RenderSubjectError);
    try {
      const rendered = escapeHtml(
        renderWithUserProperties({
          template: debouncedEmailSubject,
          userProperties: debouncedUserProperties,
        })
      );
      setRenderedSubject(rendered);
      setErrors(
        produce((errorMap) => {
          errorMap.delete(NotifyKey.RenderSubjectError);
        })
      );
      if (existingErr) {
        closeSnackbar(errorHash(NotifyKey.RenderSubjectError, existingErr));
      }
    } catch (e) {
      const message = `Subject Error: ${String(e)}`;

      if (existingErr && existingErr !== message) {
        closeSnackbar(errorHash(NotifyKey.RenderSubjectError, existingErr));
      }
      enqueueSnackbar(message, {
        variant: "error",
        persist: true,
        key: errorHash(NotifyKey.RenderSubjectError, message),
        anchorOrigin,
      });
      setErrors(
        produce((errorMap) => {
          errorMap.set(NotifyKey.RenderSubjectError, message);
        })
      );
      setRenderedSubject("Render Error");
    }
  }, [debouncedEmailSubject, debouncedUserProperties, errors]);

  const previewEmailTo = debouncedUserProperties.email;

  useEffect(() => {
    const existingErr = errors.get(NotifyKey.RenderFromError);
    try {
      const rendered = escapeHtml(
        renderWithUserProperties({
          template: debouncedEmailFrom,
          userProperties: debouncedUserProperties,
        })
      );

      if (existingErr) {
        closeSnackbar(errorHash(NotifyKey.RenderFromError, existingErr));
      }

      setRenderedFrom(rendered);
      setErrors(
        produce((errorMap) => {
          errorMap.delete(NotifyKey.RenderFromError);
        })
      );

      closeSnackbar(NotifyKey.RenderFromError);
    } catch (e) {
      const message = `From Error: ${String(e)}`;
      if (existingErr && existingErr !== message) {
        closeSnackbar(errorHash(NotifyKey.RenderFromError, existingErr));
      }
      enqueueSnackbar(message, {
        variant: "error",
        persist: true,
        key: errorHash(NotifyKey.RenderFromError, message),
        anchorOrigin,
      });
      setErrors(
        produce((errorMap) => {
          errorMap.set(NotifyKey.RenderFromError, message);
        })
      );
    }
  }, [debouncedEmailFrom, debouncedUserProperties, errors]);

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

  const handleSave = async () => {
    if (
      emailMessageUpdateRequest.type === CompletionStatus.InProgress ||
      !workspace ||
      !messageId
    ) {
      return;
    }

    setEmailMessageUpdateRequest({
      type: CompletionStatus.InProgress,
    });
    let response: AxiosResponse;
    try {
      const body: UpsertMessageTemplateResource = {
        id: messageId,
        type: TemplateResourceType.Email,
        workspaceId: workspace.id,
        name: title,
        from: emailFrom,
        body: emailBody,
        subject: emailSubject,
      };
      response = await axios.put(`${apiBase}/api/content/templates`, body, {
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      const error = e as Error;

      setEmailMessageUpdateRequest({
        type: CompletionStatus.Failed,
        error,
      });
      return;
    }
    const messageResult = schemaValidate(
      response.data,
      MessageTemplateResource
    );
    if (messageResult.isErr()) {
      console.error("unable to parse email provider", messageResult.error);

      setEmailMessageUpdateRequest({
        type: CompletionStatus.Failed,
        error: new Error(JSON.stringify(messageResult.error)),
      });
      return;
    }

    upsertMessage(messageResult.value);
    setEmailMessageUpdateRequest({
      type: CompletionStatus.NotStarted,
    });
  };

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
              borderTopRightRadius: 0,
            },
          }}
        />
        <TextField
          label="From"
          variant="filled"
          onChange={(e) => {
            setEmailFrom(e.target.value);
          }}
          required
          InputProps={{
            sx: {
              borderTopRightRadius: 0,
            },
          }}
          value={emailFrom}
        />
        <TextField
          label="Subject"
          required
          variant="filled"
          onChange={(e) => {
            setSubject(e.target.value);
          }}
          InputProps={{
            sx: {
              borderTopRightRadius: 0,
            },
          }}
          value={emailSubject}
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
              borderTopLeftRadius: 0,
            },
          }}
          sx={disabledStyles}
          value={previewSubject}
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
          <EditableName
            name={title}
            variant="h4"
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
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
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
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
