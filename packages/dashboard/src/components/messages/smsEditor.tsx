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
  Typography,
  useTheme,
} from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import ReactCodeMirror from "@uiw/react-codemirror";
import axios from "axios";
import hash from "fnv1a";
import { produce } from "immer";
import {
  ChannelType,
  CompletionStatus,
  JsonResultType,
  MessageTemplateResource,
  RenderMessageTemplateRequest,
  RenderMessageTemplateResponse,
  SmsTemplateResource,
  UpsertMessageTemplateResource,
} from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { closeSnackbar, enqueueSnackbar } from "notistack";
import React, { useEffect, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";

import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../../lib/appStore";
import {
  noticeAnchorOrigin as anchorOrigin,
  noticeAnchorOrigin,
} from "../../lib/notices";
import { SmsMessageEditorState } from "../../lib/types";
import EditableName from "../editableName";
import InfoTooltip from "../infoTooltip";

function TransitionInner(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
}

const Transition = React.forwardRef(TransitionInner);

const USER_PROPERTIES_TOOLTIP =
  "Edit an example user's properties to see the edits reflected in the rendered template. Properties are computed from user Identify traits and Track events.";

export const defaultInitialUserProperties = {
  email: "test@email.com",
  id: "ad44fb62-91a4-4ec7-be24-7f9364e331b1",
  phone: "2025550161",
  language: "en-US",
  anonymousId: "0b0d3a71-0a86-4e60-892a-d27f0b290c81",
};

export function defaultSmsMessageState(
  id: string
): Omit<
  SmsMessageEditorState,
  "smsMessageUserPropertiesJSON" | "smsMessageUserProperties"
> {
  return {
    smsMessageBody: "Example message to {{ user.phone }}",
    smsMessageTitle: `New SMS Message - ${id}`,
    smsMessageUpdateRequest: {
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

type Fullscreen = "editor" | "preview" | null;

enum NotifyKey {
  RenderBodyError = "RenderBodyError",
  UserPropertyWarning = "UserPropertyWarning",
}

function errorHash(key: NotifyKey, message: string) {
  return hash(`${key}-${message}`);
}

const errorBodyHtml = '<div style="color:red;">Render Error</div>';

export default function SmsEditor() {
  const theme = useTheme();
  const router = useRouter();
  const [errors, setErrors] = useState<Map<NotifyKey, string>>(new Map());
  const [previewBodyHtml, setRenderedBody] = useState<string>("");

  const [fullscreen, setFullscreen] = useState<Fullscreen>(null);
  const {
    apiBase,
    setSmsMessageBody: setSmsBody,
    setSmsMessagePropsJSON: setUserPropertiesJSON,
    setSmsMessageTitle,
    setSmsMessageUpdateRequest,
    setSmsUserProperties: replaceUserProperties,
    smsMessageBody: smsBody,
    smsMessageTitle,
    smsMessageUpdateRequest,
    smsMessageUserProperties: mockUserProperties,
    smsMessageUserPropertiesJSON: userPropertiesJSON,
    upsertMessage,
    userProperties,
    workspace: workspaceRequest,
  } = useAppStorePick([
    "apiBase",
    "setSmsMessageBody",
    "setSmsMessagePropsJSON",
    "setSmsMessageTitle",
    "setSmsMessageUpdateRequest",
    "setSmsUserProperties",
    "smsMessageBody",
    "smsMessageTitle",
    "smsMessageUpdateRequest",
    "smsMessageUserProperties",
    "smsMessageUserPropertiesJSON",
    "upsertMessage",
    "userProperties",
    "workspace",
  ]);

  const userPropertySet: Set<string> = useMemo(
    () =>
      new Set(
        userProperties.type === CompletionStatus.Successful
          ? new Set(userProperties.value.map((up) => up.name))
          : []
      ),
    [userProperties]
  );

  const messageId =
    typeof router.query.id === "string" ? router.query.id : null;

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

  const [debouncedSmsBody] = useDebounce(smsBody, 300);
  const [debouncedUserProperties] = useDebounce(mockUserProperties, 300);

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

  useEffect(() => {
    (async () => {
      if (!workspace) {
        return;
      }

      const data: RenderMessageTemplateRequest = {
        workspaceId: workspace.id,
        channel: ChannelType.Sms,
        userProperties: debouncedUserProperties,
        contents: {
          body: {
            value: debouncedSmsBody,
          },
        },
      };

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
  }, [apiBase, debouncedSmsBody, debouncedUserProperties, errors, workspace]);

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

  if (!workspace || !messageId) {
    return null;
  }

  const upsertSmsDefinition: SmsTemplateResource = {
    type: ChannelType.Sms,
    body: smsBody,
  };
  const updateData: UpsertMessageTemplateResource = {
    id: messageId,
    workspaceId: workspace.id,
    name: smsMessageTitle,
    definition: upsertSmsDefinition,
  };

  const handleSave = apiRequestHandlerFactory({
    request: smsMessageUpdateRequest,
    setRequest: setSmsMessageUpdateRequest,
    responseSchema: MessageTemplateResource,
    setResponse: upsertMessage,
    onSuccessNotice: `Saved template ${smsMessageTitle}.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to save template ${smsMessageTitle}.`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/content/templates`,
      data: updateData,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  const htmlCodeMirrorHandleChange = (val: string) => {
    setSmsBody(val);
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
          value={smsBody}
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
          title="sms-body-preview"
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
            name={smsMessageTitle}
            variant="h4"
            onChange={(e) => {
              setSmsMessageTitle(e.target.value);
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
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={errors.size > 0}
          >
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

// import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
// import { linter, lintGutter } from "@codemirror/lint";
// import { EditorView } from "@codemirror/view";
// import {
//   Box,
//   Button,
//   Stack,
//   TextField,
//   Typography,
//   useTheme,
// } from "@mui/material";
// import ReactCodeMirror from "@uiw/react-codemirror";
// import {
//   ChannelType,
//   CompletionStatus,
//   MessageTemplateResource,
//   UpsertMessageTemplateResource,
// } from "isomorphic-lib/src/types";
// import { useRouter } from "next/router";
// import { useState } from "react";

// import MobilePreviewImage from "../../../public/mobile-mock.svg";
// import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
// import { useAppStore, useAppStorePick } from "../../lib/appStore";
// import { SmsMessageEditorState } from "../../lib/types";
// import EditableName from "../editableName";
// import InfoTooltip from "../infoTooltip";

// const USER_PROPERTIES_TOOLTIP =
//   "Edit an example user's properties to see the edits reflected in the rendered template. Properties are computed from user Identify traits and Track events.";

// enum NotifyKey {
//   RenderBodyError = "RenderBodyError",
// }

// export default function SmsEditor() {
//   const theme = useTheme();
//   const router = useRouter();
//   const {
//     smsMessageBody: body,
//     setSmsMessageBody: setBody,
//     smsMessageUpdateRequest: updateRequest,
//     smsMessageUserPropertiesJSON: userJson,
//     smsMessageTitle: title,
//     setSmsMessageTitle: setTitle,
//     workspace: workspaceRequest,
//     apiBase,
//     upsertMessage,
//     setSmsMessagePropsJSON: setUserJson,
//   } = useAppStorePick([
//     "workspace",
//     "apiBase",
//     "smsMessageBody",
//     "smsMessageUpdateRequest",
//     "smsMessageTitle",
//     "setSmsMessageTitle",
//     "smsMessageUserPropertiesJSON",
//     "setSmsMessageBody",
//     "setSmsMessagePropsJSON",
//     "setSmsMessageUpdateRequest",
//     "upsertMessage",
//   ]);
//   const [errors] = useState<Map<NotifyKey, string>>(new Map());
//   const setSmsMessageUpdateRequest = useAppStore(
//     (state) => state.setSmsMessageUpdateRequest
//   );

//   const messageId =
//     typeof router.query.id === "string" ? router.query.id : null;
//   const workspace =
//     workspaceRequest.type === CompletionStatus.Successful
//       ? workspaceRequest.value
//       : null;

//   if (!workspace || !messageId) {
//     return null;
//   }

//   const updateData: UpsertMessageTemplateResource = {
//     id: messageId,
//     workspaceId: workspace.id,
//     name: title,
//     definition: {
//       type: ChannelType.Sms,
//       body,
//     },
//   };

//   const jsonCodeMirrorHandleChange = (val: string) => {
//     setUserJson(val);
//     try {
//       const parsed = JSON.parse(val);
//       if (!(typeof parsed === "object" && parsed !== null)) {
//         return;
//       }
//       const parsedObj: Record<string, unknown> = parsed;
//       const props: Record<string, string> = {};

//       // eslint-disable-next-line guard-for-in
//       for (const key in parsedObj) {
//         const parsedVal = parsed[key];
//         if (typeof parsedVal !== "string") {
//           continue;
//         }
//         props[key] = parsedVal;
//       }
//       // eslint-disable-next-line no-empty
//     } catch (e) {}
//   };

//   const editor = (
//     <TextField
//       label="Message"
//       variant="filled"
//       sx={{ width: "100%" }}
//       InputProps={{
//         sx: {
//           borderTopRightRadius: 0,
//         },
//       }}
//       multiline
//       value={body}
//       onChange={(e) => setBody(e.target.value)}
//     />
//   );

//   const preview = (
//     <Stack
//       sx={{
//         position: "relative",
//         height: "660px",
//         width: "450px",
//         margin: "0px auto",
//         backgroundImage: `url(${MobilePreviewImage.src})`,
//       }}
//     >
//       <Box
//         sx={{
//           top: "150px",
//           position: "relative",
//           width: "404px",
//           margin: "auto",
//         }}
//       >
//         <Box
//           sx={{
//             backgroundColor: "#fff",
//             borderRadius: "28px",
//             padding: "20px 16px",
//             width: "100%",
//           }}
//         >
//           <Typography variant="body1">{body}</Typography>
//         </Box>
//       </Box>
//     </Stack>
//   );

//   const handleSave = apiRequestHandlerFactory({
//     request: updateRequest,
//     setRequest: setSmsMessageUpdateRequest,
//     responseSchema: MessageTemplateResource,
//     setResponse: upsertMessage,
//     onSuccessNotice: `Saved template ${title}.`,
//     onFailureNoticeHandler: () =>
//       `API Error: Failed to save template ${title}.`,
//     requestConfig: {
//       method: "PUT",
//       url: `${apiBase}/api/content/templates`,
//       data: updateData,
//       headers: {
//         "Content-Type": "application/json",
//       },
//     },
//   });

//   return (
//     <Stack
//       direction="row"
//       sx={{
//         width: "100%",
//         paddingRight: 2,
//         paddingTop: 2,
//       }}
//       spacing={1}
//     >
//       <Stack
//         direction="column"
//         spacing={2}
//         sx={{
//           borderTopRightRadius: 1,
//           width: "25%",
//           padding: 1,
//           border: `1px solid ${theme.palette.grey[200]}`,
//           boxShadow: theme.shadows[2],
//         }}
//       >
//         <EditableName
//           name={title}
//           variant="h4"
//           onChange={(e) => {
//             setTitle(e.target.value);
//           }}
//         />
//         <InfoTooltip title={USER_PROPERTIES_TOOLTIP}>
//           <Typography variant="h5">User Properties</Typography>
//         </InfoTooltip>
//         <ReactCodeMirror
//           value={userJson}
//           onChange={jsonCodeMirrorHandleChange}
//           extensions={[
//             codeMirrorJson(),
//             linter(jsonParseLinter()),
//             EditorView.lineWrapping,
//             EditorView.theme({
//               "&": {
//                 fontFamily: theme.typography.fontFamily,
//               },
//             }),
//             lintGutter(),
//           ]}
//         />
//         <Button
//           variant="contained"
//           onClick={handleSave}
//           disabled={errors.size > 0}
//         >
//           Save
//         </Button>
//       </Stack>
//       <Stack direction="row" sx={{ flex: 1 }}>
//         {editor}
//       </Stack>
//       <Stack direction="row" sx={{ flex: 1 }}>
//         <Box
//           sx={{
//             width: "100%",
//           }}
//         >
//           {preview}
//         </Box>
//       </Stack>
//     </Stack>
//   );
// }

// export const defaultInitialUserProperties = {
//   email: "test@email.com",
//   id: "ad44fb62-91a4-4ec7-be24-7f9364e331b1",
//   phone: "2025550161",
//   language: "en-US",
//   anonymousId: "0b0d3a71-0a86-4e60-892a-d27f0b290c81",
// };

// export function defaultSmsMessageState(
//   id: string
// ): Omit<
//   SmsMessageEditorState,
//   "smsMessageUserPropertiesJSON" | "smsMessageUserProperties"
// > {
//   return {
//     smsMessageTitle: `SMS Message - ${id}`,
//     smsMessageBody: "This is the default SMS message body. {{user.phone}}",
//     smsMessageUpdateRequest: {
//       type: CompletionStatus.NotStarted,
//     },
//   };
// }
