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
  Typography,
  useTheme,
} from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import ReactCodeMirror from "@uiw/react-codemirror";
import axios from "axios";
import hash from "fnv1a";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  CompletionStatus,
  EphemeralRequestStatus,
  InternalEventType,
  JsonResultType,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  MessageTemplateTestRequest,
  MessageTemplateTestResponse,
  RenderMessageTemplateRequest,
  RenderMessageTemplateRequestContents,
  RenderMessageTemplateResponse,
  UpsertMessageTemplateResource,
  UserPropertyAssignments,
  WorkspaceMemberResource,
} from "isomorphic-lib/src/types";
import { LoremIpsum } from "lorem-ipsum";
import { useRouter } from "next/router";
import { closeSnackbar, enqueueSnackbar } from "notistack";
import React, { useCallback, useEffect, useMemo } from "react";
import { useDebounce } from "use-debounce";
import { useImmer } from "use-immer";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import {
  noticeAnchorOrigin as anchorOrigin,
  noticeAnchorOrigin,
} from "../lib/notices";
import { useUpdateEffect } from "../lib/useUpdateEffect";
import EditableName from "./editableName";
import InfoTooltip from "./infoTooltip";
import LoadingModal from "./loadingModal";

const USER_PROPERTY_WARNING_KEY = "user-property-warning";

const USER_PROPERTIES_TOOLTIP =
  "Edit an example user's properties to see the edits reflected in the rendered template. Properties are computed from user Identify traits and Track events.";

function TransitionInner(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
}

const Transition = React.forwardRef(TransitionInner);

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

export interface TemplateState {
  fullscreen: "preview" | "editor" | null;
  userProperties: UserPropertyAssignments;
  errors: Map<string, string>;
  userPropertiesJSON: string;
  title: string | null;
  testRequest: EphemeralRequestStatus<Error>;
  definition: MessageTemplateResourceDefinition | null;
  testResponse: MessageTemplateTestResponse | null;
  updateRequest: EphemeralRequestStatus<Error>;
  rendered: Record<string, string>;
}

const LOREM = new LoremIpsum({
  sentencesPerParagraph: {
    max: 8,
    min: 4,
  },
  wordsPerSentence: {
    max: 16,
    min: 4,
  },
});

export interface RenderPreviewParams {
  rendered: Record<string, string>;
  userProperties: UserPropertyAssignments;
}

export type RenderPreviewSection = (
  args: RenderPreviewParams
) => React.ReactNode;

export type SetDefinition = (
  setter: (
    dfn: MessageTemplateResourceDefinition
  ) => MessageTemplateResourceDefinition
) => void;

export interface RenderEditorParams {
  setDefinition: SetDefinition;
  definition: MessageTemplateResourceDefinition;
}

export type RenderEditorSection = (args: RenderEditorParams) => React.ReactNode;

function errorHash(key: string, message: string) {
  return hash(`${key}-${message}`);
}

export type DefinitionToPreview = (
  dfn: MessageTemplateResourceDefinition
) => RenderMessageTemplateRequestContents;

export default function TemplateEditor({
  templateId,
  renderEditorBody,
  renderEditorHeader,
  renderPreviewBody,
  renderPreviewHeader,
  onTitleChange,
  hideSaveButton,
  disabled,
  member,
  hideTitle,
  saveOnUpdate = false,
  fieldToReadable,
  definitionToPreview,
}: {
  templateId: string;
  disabled?: boolean;
  hideTitle?: boolean;
  hideSaveButton?: boolean;
  saveOnUpdate?: boolean;
  member?: WorkspaceMemberResource;
  renderPreviewHeader: RenderPreviewSection;
  renderPreviewBody: RenderPreviewSection;
  renderEditorHeader: RenderEditorSection;
  renderEditorBody: RenderEditorSection;
  definitionToPreview: DefinitionToPreview;
  fieldToReadable: (field: string) => string | null;
  onTitleChange?: (title: string) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const {
    apiBase,
    messages,
    workspace: workspaceResult,
    userProperties: userPropertiesResult,
    upsertMessage,
  } = useAppStorePick([
    "apiBase",
    "messages",
    "workspace",
    "userProperties",
    "upsertMessage",
  ]);
  const template =
    messages.type === CompletionStatus.Successful
      ? messages.value.find((m) => m.id === templateId)
      : undefined;

  console.log("template loc2", template);
  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;
  const initialUserProperties = useMemo(() => {
    if (userPropertiesResult.type !== CompletionStatus.Successful) {
      return {};
    }
    const userPropertyAssignments: UserPropertyAssignments = {};
    for (const userProperty of userPropertiesResult.value) {
      let value: string;
      if (userProperty.name === "email" && member?.email) {
        value = member.email;
      } else {
        value = LOREM.generateWords(1);
      }

      userPropertyAssignments[userProperty.name] = value;
    }
    return userPropertyAssignments;
  }, [userPropertiesResult, member]);

  const [
    {
      fullscreen,
      userProperties,
      userPropertiesJSON,
      title,
      definition,
      errors,
      rendered,
      testResponse,
      testRequest,
      updateRequest,
    },
    setState,
  ] = useImmer<TemplateState>({
    fullscreen: null,
    definition: template?.draft ?? template?.definition ?? null,
    title: template?.name ?? "",
    errors: new Map(),
    userProperties: initialUserProperties,
    userPropertiesJSON: JSON.stringify(initialUserProperties, null, 2),
    testResponse: null,
    testRequest: {
      type: CompletionStatus.NotStarted,
    },
    updateRequest: {
      type: CompletionStatus.NotStarted,
    },
    rendered: {},
  });
  const handleSave = useCallback(
    ({ saveAsDraft = false }: { saveAsDraft?: boolean } = {}) => {
      if (
        disabled ||
        workspaceResult.type !== CompletionStatus.Successful ||
        !definition
      ) {
        return;
      }
      const workspaceId = workspaceResult.value.id;

      const updateData: UpsertMessageTemplateResource = {
        id: templateId,
        workspaceId,
        name: title ?? undefined,
        draft: definition,
      };

      if (!saveAsDraft) {
        updateData.definition = definition;
      }

      apiRequestHandlerFactory({
        request: updateRequest,
        setRequest: (request) =>
          setState((draft) => {
            draft.updateRequest = request;
          }),
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      disabled,
      workspaceResult,
      definition,
      templateId,
      title,
      upsertMessage,
      apiBase,
      setState,
    ]
  );

  useUpdateEffect(() => {
    handleSave({
      saveAsDraft: !saveOnUpdate,
    });
  }, [handleSave, saveOnUpdate]);

  const [debouncedUserProperties] = useDebounce(userProperties, 300);
  const [debouncedDefinition] = useDebounce(definition, 300);

  useEffect(() => {
    (async () => {
      if (!workspace || !debouncedDefinition) {
        return;
      }
      const data: RenderMessageTemplateRequest = {
        workspaceId: workspace.id,
        channel: ChannelType.Email,
        userProperties: debouncedUserProperties,
        contents: definitionToPreview(debouncedDefinition),
      };

      try {
        const response = await axios({
          method: "POST",
          url: `${apiBase}/api/content/templates/render`,
          data,
        });

        const { contents } = response.data as RenderMessageTemplateResponse;
        // FIXME errors not closing correctly

        const newRendered: Record<string, string> = {};
        const newErrors = new Map(errors);

        for (const contentKey in contents) {
          const content = contents[contentKey];
          if (content === undefined) {
            continue;
          }
          const existingErr = errors.get(contentKey);
          if (content.type === JsonResultType.Ok) {
            newRendered[contentKey] = content.value;
            if (existingErr) {
              closeSnackbar(errorHash(contentKey, existingErr));
              newErrors.delete(contentKey);
            }
            continue;
          }
          const readable = fieldToReadable(contentKey) ?? contentKey;
          const message = `${readable} Error: ${content.err}`;

          if (existingErr && existingErr !== message) {
            closeSnackbar(errorHash(contentKey, existingErr));
          }
          enqueueSnackbar(message, {
            variant: "error",
            persist: true,
            key: errorHash(contentKey, message),
            anchorOrigin,
          });
          newErrors.set(contentKey, content.err);
        }

        setState((draft) => {
          draft.rendered = newRendered;
          draft.errors = newErrors;
        });
      } catch (err) {
        enqueueSnackbar("API Error: failed to render template preview.", {
          variant: "error",
          autoHideDuration: 3000,
          anchorOrigin: noticeAnchorOrigin,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    apiBase,
    debouncedUserProperties,
    debouncedDefinition,
    definitionToPreview,
    fieldToReadable,
    setState,
    workspace,
  ]);

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
    let missingUserProperty: string | null = null;
    const userPropertySet = new Set(
      userPropertiesResult.type === CompletionStatus.Successful
        ? userPropertiesResult.value.map((p) => p.name)
        : []
    );
    for (const userProperty in userProperties) {
      if (!userPropertySet.has(userProperty)) {
        missingUserProperty = userProperty;
        break;
      }
    }
    const existingMsg = errors.get(USER_PROPERTY_WARNING_KEY);
    if (!missingUserProperty) {
      if (existingMsg) {
        closeSnackbar(errorHash(USER_PROPERTY_WARNING_KEY, existingMsg));
      }

      setState((draft) => {
        draft.errors.delete(USER_PROPERTY_WARNING_KEY);
      });
      return;
    }

    const message = `User property named "${missingUserProperty}" is not configured.`;
    if (existingMsg && existingMsg !== message) {
      closeSnackbar(errorHash(USER_PROPERTY_WARNING_KEY, existingMsg));
    }
    enqueueSnackbar(message, {
      variant: "warning",
      persist: true,
      key: errorHash(USER_PROPERTY_WARNING_KEY, message),
      anchorOrigin,
    });
    setState((draft) => {
      draft.errors.set(USER_PROPERTY_WARNING_KEY, message);
    });
  }, [errors, setState, userProperties, userPropertiesResult]);

  if (!workspace) {
    return null;
  }

  const submitTestData: MessageTemplateTestRequest = {
    channel: ChannelType.Email,
    workspaceId: workspace.id,
    templateId,
    userProperties,
  };

  const submitTest = apiRequestHandlerFactory({
    request: testRequest,
    setRequest: (request) =>
      setState((draft) => {
        draft.testRequest = request;
      }),
    responseSchema: MessageTemplateTestResponse,
    setResponse: (response) =>
      setState((draft) => {
        draft.testResponse = response;
      }),
    onSuccessNotice: `Attempted test message.`,
    onFailureNoticeHandler: () => `API Error: Failed to attempt test message.`,
    requestConfig: {
      method: "POST",
      url: `${apiBase}/api/content/templates/test`,
      data: submitTestData,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  let testResponseEl: React.ReactNode = null;
  if (testResponse) {
    if (
      testResponse.type === JsonResultType.Ok &&
      testResponse.value.type === InternalEventType.MessageSent &&
      testResponse.value.variant.type === ChannelType.Email
    ) {
      const { to } = testResponse.value.variant;
      testResponseEl = (
        <Alert severity="success">Message was sent successfully to {to}</Alert>
      );
    } else if (testResponse.type === JsonResultType.Err) {
      testResponseEl = (
        <Stack spacing={1}>
          <Alert severity="error">
            Failed to send test message. Suggestions:
          </Alert>
          {testResponse.err.suggestions.map((suggestion, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Alert key={i} severity="warning">
              {suggestion}
            </Alert>
          ))}
          <Typography
            sx={{
              fontFamily: "monospace",
              backgroundColor: theme.palette.grey[100],
            }}
          >
            <code>{testResponse.err.responseData}</code>
          </Typography>
        </Stack>
      );
    }
  }

  const handleFullscreenClose = () => {
    setState((draft) => {
      draft.fullscreen = null;
    });
  };
  const renderEditorParams: RenderEditorParams | null =
    definition !== null
      ? {
          definition,
          setDefinition: (setter) =>
            setState((draft) => {
              if (draft.definition === null) {
                return draft;
              }
              draft.definition = setter(draft.definition);
              return draft;
            }),
        }
      : null;

  const editor = (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
      spacing={1}
    >
      <Stack>
        {renderEditorParams && renderEditorHeader(renderEditorParams)}
      </Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <FormLabel sx={{ paddingLeft: 1 }}>Body Message</FormLabel>
        {fullscreen === null ? (
          <IconButton
            size="small"
            onClick={() =>
              setState((draft) => {
                draft.fullscreen = "editor";
              })
            }
          >
            <Fullscreen />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={handleFullscreenClose}>
            <FullscreenExit />
          </IconButton>
        )}
      </Stack>
      <BodyBox direction="left">
        {renderEditorParams ? renderEditorBody(renderEditorParams) : null}
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
      <Stack>{renderPreviewHeader({ rendered, userProperties })}</Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <FormLabel sx={{ paddingLeft: 1 }}>Body Preview</FormLabel>
        {fullscreen === null ? (
          <IconButton
            size="small"
            onClick={() =>
              setState((draft) => {
                draft.fullscreen = "preview";
              })
            }
          >
            <Fullscreen />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={handleFullscreenClose}>
            <FullscreenExit />
          </IconButton>
        )}
      </Stack>
      <BodyBox direction="right">
        {renderPreviewBody({ rendered, userProperties })}
      </BodyBox>
    </Stack>
  );
  return (
    <>
      <Stack
        direction="row"
        sx={{
          height: "100%",
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
          {title !== null && !hideTitle && onTitleChange && (
            <EditableName
              name={title}
              variant="h4"
              onChange={(e) => onTitleChange(e.target.value)}
            />
          )}

          <InfoTooltip title={USER_PROPERTIES_TOOLTIP}>
            <Typography variant="h5">User Properties</Typography>
          </InfoTooltip>
          <ReactCodeMirror
            value={userPropertiesJSON}
            onChange={(json) =>
              setState((draft) => {
                const parsed = JSON.parse(json);
                const result = schemaValidateWithErr(
                  parsed,
                  UserPropertyAssignments
                );
                if (result.isErr()) {
                  return;
                }
                draft.userProperties = result.value;
              })
            }
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
              onClick={() => handleSave()}
              // FIXME errors.size
              disabled={false}
            >
              Publish Changes
            </Button>
          )}
          <LoadingModal
            openTitle="Send Test Message"
            onSubmit={submitTest}
            onClose={() =>
              setState((draft) => {
                draft.testResponse = null;
              })
            }
          >
            {testResponseEl}
          </LoadingModal>
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
        Preview
      </Dialog>
    </>
  );
}
