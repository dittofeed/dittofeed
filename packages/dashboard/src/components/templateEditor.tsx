import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Fullscreen, FullscreenExit } from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  Divider,
  FormLabel,
  IconButton,
  Slide,
  Stack,
  styled,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import ReactCodeMirror from "@uiw/react-codemirror";
import axios from "axios";
import hash from "fnv1a";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import { emailProviderLabel } from "isomorphic-lib/src/email";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  EmailProviderType,
  EphemeralRequestStatus,
  InternalEventType,
  JsonResultType,
  MessageTemplateResource,
  MessageTemplateResourceDefinition,
  MessageTemplateTestRequest,
  MessageTemplateTestResponse,
  MobilePushProviderType,
  RenderMessageTemplateRequest,
  RenderMessageTemplateRequestContents,
  RenderMessageTemplateResponse,
  SmsProviderType,
  UpsertMessageTemplateResource,
  UserPropertyAssignments,
  UserPropertyResource,
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
import {
  Publisher,
  PublisherDraftToggle,
  PublisherDraftToggleStatus,
  PublisherOutOfDateStatus,
  PublisherOutOfDateToggleStatus,
  PublisherStatus,
  PublisherStatusType,
  PublisherUnpublishedStatus,
  PublisherUpToDateStatus,
} from "./publisher";
import TemplatePreview from "./templatePreview";
import { deepEquals } from "isomorphic-lib/src/equality";

const USER_PROPERTY_WARNING_KEY = "user-property-warning";

const USER_PROPERTIES_TOOLTIP =
  "Edit an example user's properties to see the edits reflected in the rendered template. Properties are computed from user Identify traits and Track events.";

function TransitionInner(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
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
  }),
);

function ProviderOverrideSelector<P>({
  value,
  options,
  onChange,
}: {
  value: P | null;
  options: {
    id: P;
    label: string;
  }[];
  onChange: (value: P | null) => void;
}) {
  const option = options.find((o) => o.id === value) ?? null;
  return (
    <Autocomplete
      value={option}
      options={options}
      onChange={(_e, newValue) => {
        onChange(newValue?.id ?? null);
      }}
      renderInput={(params) => (
        <TextField {...params} label="Provider Override" />
      )}
    />
  );
}

export interface BaseTemplateState {
  fullscreen: "preview" | "editor" | null;
  errors: Map<string, string>;
  serverState: {
    userProperties: UserPropertyAssignments;
    userPropertiesJSON: string;
    title: string;
    draft?: MessageTemplateResourceDefinition;
    definition: MessageTemplateResourceDefinition;
  } | null;
  testRequest: EphemeralRequestStatus<Error>;
  testResponse: MessageTemplateTestResponse | null;
  updateRequest: EphemeralRequestStatus<Error>;
  rendered: Record<string, string>;
}

export interface EmailTemplateState extends BaseTemplateState {
  channel: (typeof ChannelType)["Email"];
  providerOverride: EmailProviderType | null;
}

export interface SmsTemplateState extends BaseTemplateState {
  channel: (typeof ChannelType)["Sms"];
  providerOverride: SmsProviderType | null;
}

export interface MobilePushTemplateState extends BaseTemplateState {
  channel: (typeof ChannelType)["MobilePush"];
  providerOverride: MobilePushProviderType | null;
}

export interface WebhookTemplateState extends BaseTemplateState {
  channel: (typeof ChannelType)["Webhook"];
  providerOverride: null;
}

export type TemplateEditorState =
  | EmailTemplateState
  | SmsTemplateState
  | MobilePushTemplateState
  | WebhookTemplateState;

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
  args: RenderPreviewParams,
) => React.ReactNode;

export type SetDefinition = (
  setter: (
    dfn: MessageTemplateResourceDefinition,
  ) => MessageTemplateResourceDefinition,
) => void;

export interface RenderEditorParams {
  setDefinition: SetDefinition;
  definition: MessageTemplateResourceDefinition;
  disabled: boolean;
}

export type RenderEditorSection = (args: RenderEditorParams) => React.ReactNode;

function errorHash(key: string, message: string) {
  return hash(`${key}-${message}`);
}

export type DefinitionToPreview = (
  dfn: MessageTemplateResourceDefinition,
) => RenderMessageTemplateRequestContents;

function getUserPropertyValue({
  member,
  userProperty,
}: {
  member?: WorkspaceMemberResource;
  userProperty: UserPropertyResource;
}): unknown {
  if (userProperty.exampleValue) {
    const parsed = jsonParseSafe(userProperty.exampleValue);
    if (parsed.isOk()) {
      return parsed.value;
    }
  }
  if (userProperty.name === "email" && member?.email) {
    return member.email;
  }
  return LOREM.generateWords(1);
}

function getUserPropertyValues({
  member,
  userProperties,
}: {
  member?: WorkspaceMemberResource;
  userProperties: UserPropertyResource[];
}): UserPropertyAssignments {
  const userPropertyAssignments: UserPropertyAssignments = {};
  for (const userProperty of userProperties) {
    userPropertyAssignments[userProperty.name] = getUserPropertyValue({
      member,
      userProperty,
    });
  }
  return userPropertyAssignments;
}

export default function TemplateEditor({
  templateId,
  channel,
  renderEditorBody,
  renderEditorHeader,
  renderPreviewBody,
  renderPreviewHeader,
  hideSaveButton,
  disabled,
  member,
  hideTitle,
  saveOnUpdate = false,
  fieldToReadable,
  definitionToPreview,
}: {
  channel: ChannelType;
  templateId: string;
  disabled?: boolean;
  hideTitle?: boolean;
  // FIXME
  hideSaveButton?: boolean;
  saveOnUpdate?: boolean;
  member?: WorkspaceMemberResource;
  renderPreviewHeader: RenderPreviewSection;
  renderPreviewBody: RenderPreviewSection;
  renderEditorHeader: RenderEditorSection;
  renderEditorBody: RenderEditorSection;
  definitionToPreview: DefinitionToPreview;
  fieldToReadable: (field: string) => string | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const {
    apiBase,
    messages,
    workspace: workspaceResult,
    userProperties: userPropertiesResult,
    upsertMessage,
    viewDraft,
    inTransition,
    setViewDraft,
  } = useAppStorePick([
    "apiBase",
    "messages",
    "workspace",
    "userProperties",
    "upsertMessage",
    "viewDraft",
    "setViewDraft",
    "inTransition",
  ]);
  const template =
    messages.type === CompletionStatus.Successful
      ? messages.value.find((m) => m.id === templateId)
      : undefined;

  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;
  const initialUserProperties = useMemo(() => {
    if (userPropertiesResult.type !== CompletionStatus.Successful) {
      return {};
    }
    return getUserPropertyValues({
      member,
      userProperties: userPropertiesResult.value,
    });
  }, [userPropertiesResult, member]);

  const [state, setState] = useImmer<TemplateEditorState>({
    fullscreen: null,
    serverState: null,
    errors: new Map(),
    testResponse: null,
    testRequest: {
      type: CompletionStatus.NotStarted,
    },
    updateRequest: {
      type: CompletionStatus.NotStarted,
    },
    providerOverride: null,
    channel,
    rendered: {},
  });
  const {
    fullscreen,
    errors,
    rendered,
    testResponse,
    testRequest,
    updateRequest,
    serverState,
  } = state;

  // Set server state post page transition for CSR
  useEffect(() => {
    if (inTransition || serverState) {
      return;
    }
    setState((draft) => {
      if (!template) {
        return;
      }
      let d: MessageTemplateResourceDefinition | null = null;
      if (viewDraft && template.draft) {
        d = template.draft;
      } else if (template.definition) {
        d = template.definition;
      }
      if (!d) {
        return;
      }
      draft.serverState = {
        title: template.name,
        definition: d,
        userProperties: initialUserProperties,
        userPropertiesJSON: JSON.stringify(initialUserProperties, null, 2),
      };
    });
  }, [
    initialUserProperties,
    setState,
    inTransition,
    template,
    viewDraft,
    serverState,
  ]);

  // FIXME incorporate hide save button
  // FIXME rename hide save button
  const publisherStatuses: {
    publisher: PublisherStatus;
    draftToggle: PublisherDraftToggleStatus;
  } | null = useMemo(() => {
    if (!template || !serverState) {
      return null;
    }
    if (!template.definition) {
      return null;
    }
    if (!template.draft || !deepEquals(template.draft, template.definition)) {
      const publisher: PublisherUpToDateStatus = {
        type: PublisherStatusType.UpToDate,
      };
      return { publisher, draftToggle: publisher };
    }
    const publisher: PublisherOutOfDateStatus = {
      type: PublisherStatusType.OutOfDate,
      disabled: !viewDraft || errors.size > 0,
      onPublish: () => {},
      onRevert: () => {},
      updateRequest,
    };

    const draftToggle: PublisherOutOfDateToggleStatus = {
      type: PublisherStatusType.OutOfDate,
      updateRequest,
      isDraft: viewDraft,
      onToggle: ({ isDraft: newIsDraft }) => {
        setViewDraft(newIsDraft);
      },
    };
    return { publisher, draftToggle };
  }, [
    errors.size,
    serverState,
    setViewDraft,
    template,
    updateRequest,
    viewDraft,
  ]);

  const viewedDefinition =
    viewDraft && serverState?.draft
      ? serverState.draft
      : serverState?.definition;

  console.log(
    "viewedDefinition loc1",
    ...Object.values(viewedDefinition ?? {}),
  );
  console.log("template loc2", ...Object.values(template ?? {}));

  const handleSave = useCallback(
    ({ saveAsDraft = false }: { saveAsDraft?: boolean } = {}) => {
      // if (
      //   disabled ||
      //   workspaceResult.type !== CompletionStatus.Successful ||
      //   !serverState
      // ) {
      //   return;
      // }
      // const workspaceId = workspaceResult.value.id;
      // const updateData: UpsertMessageTemplateResource = {
      //   id: templateId,
      //   workspaceId,
      //   name: serverState.title,
      //   draft: serverState.definition,
      // };
      // if (!saveAsDraft) {
      //   updateData.definition = ;
      // }
      // const draftNotice = saveAsDraft
      //   ? "Saved template draft."
      //   : "Published template draft.";
      // apiRequestHandlerFactory({
      //   request: updateRequest,
      //   setRequest: (request) =>
      //     setState((draft) => {
      //       draft.updateRequest = request;
      //     }),
      //   responseSchema: MessageTemplateResource,
      //   setResponse: upsertMessage,
      //   onSuccessNotice: draftNotice,
      //   onFailureNoticeHandler: () => `API Error: Failed to update template.`,
      //   requestConfig: {
      //     method: "PUT",
      //     url: `${apiBase}/api/content/templates`,
      //     data: updateData,
      //     headers: {
      //       "Content-Type": "application/json",
      //     },
      //   },
      // })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, workspaceResult, templateId, upsertMessage, apiBase, setState],
  );

  useUpdateEffect(() => {
    handleSave({
      saveAsDraft: !saveOnUpdate,
    });
  }, [handleSave, saveOnUpdate]);

  const [debouncedUserProperties] = useDebounce(
    serverState?.userProperties ?? {},
    300,
  );
  const [debouncedDefinition] = useDebounce(viewedDefinition, 300);

  useEffect(() => {
    (async () => {
      if (
        !workspace ||
        !debouncedDefinition ||
        Object.keys(debouncedUserProperties).length === 0
      ) {
        return;
      }
      const data: RenderMessageTemplateRequest = {
        workspaceId: workspace.id,
        channel,
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
          newErrors.set(contentKey, message);
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
        : [],
    );
    for (const userProperty in debouncedUserProperties) {
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
  }, [errors, setState, debouncedUserProperties, userPropertiesResult]);

  if (!workspace || !template) {
    return null;
  }

  const submitTestDataBase: Pick<
    MessageTemplateTestRequest,
    "workspaceId" | "templateId" | "userProperties"
  > = {
    workspaceId: workspace.id,
    templateId,
    userProperties: debouncedUserProperties,
  };
  let submitTestData: MessageTemplateTestRequest;
  switch (state.channel) {
    case ChannelType.Email:
      submitTestData = {
        ...submitTestDataBase,
        channel: state.channel,
        provider: state.providerOverride ?? undefined,
      };
      break;
    case ChannelType.Sms:
      submitTestData = {
        ...submitTestDataBase,
        channel: state.channel,
        provider: state.providerOverride ?? undefined,
      };
      break;
    case ChannelType.MobilePush:
      submitTestData = {
        ...submitTestDataBase,
        channel: state.channel,
        provider: state.providerOverride ?? undefined,
      };
      break;
    case ChannelType.Webhook:
      submitTestData = {
        ...submitTestDataBase,
        channel: state.channel,
      };
      break;
    default:
      assertUnreachable(state);
  }

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

  let testModalContents: React.ReactNode = null;
  if (testResponse) {
    if (
      testResponse.type === JsonResultType.Ok &&
      testResponse.value.type === InternalEventType.MessageSent &&
      testResponse.value.variant.type === channel
    ) {
      const { to } = testResponse.value.variant;
      testModalContents = (
        <Alert severity="success">Message was sent successfully to {to}</Alert>
      );
    } else if (testResponse.type === JsonResultType.Err) {
      testModalContents = (
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
  } else {
    let to: string | null = null;
    if (channel === ChannelType.Webhook) {
      if (debouncedDefinition?.type === ChannelType.Webhook) {
        to = debouncedUserProperties[debouncedDefinition.identifierKey] ?? null;
      }
    } else {
      const identiferKey = CHANNEL_IDENTIFIERS[channel];
      to = debouncedUserProperties[identiferKey] ?? null;
    }
    let providerAutocomplete: React.ReactNode;
    switch (state.channel) {
      case ChannelType.Email: {
        const providerOptions: { id: EmailProviderType; label: string }[] =
          Object.values(EmailProviderType).map((type) => ({
            id: type,
            label: emailProviderLabel(type),
          }));

        providerAutocomplete = (
          <ProviderOverrideSelector<EmailProviderType>
            value={state.providerOverride}
            options={providerOptions}
            onChange={(value) => {
              setState((draft) => {
                draft.providerOverride = value;
              });
            }}
          />
        );
        break;
      }
      case ChannelType.Sms: {
        const providerOptions: { id: SmsProviderType; label: string }[] =
          Object.values(SmsProviderType).map((type) => ({
            id: type,
            label: type,
          }));

        providerAutocomplete = (
          <ProviderOverrideSelector<SmsProviderType>
            value={state.providerOverride}
            options={providerOptions}
            onChange={(value) => {
              setState((draft) => {
                draft.providerOverride = value;
              });
            }}
          />
        );
        break;
      }
      case ChannelType.MobilePush: {
        const providerOptions: { id: MobilePushProviderType; label: string }[] =
          Object.values(MobilePushProviderType).map((type) => ({
            id: type,
            label: type,
          }));
        providerAutocomplete = (
          <ProviderOverrideSelector<MobilePushProviderType>
            value={state.providerOverride}
            options={providerOptions}
            onChange={(value) => {
              setState((draft) => {
                draft.providerOverride = value;
              });
            }}
          />
        );
        break;
      }
      case ChannelType.Webhook:
        providerAutocomplete = null;
        break;
      default:
        assertUnreachable(state);
    }

    testModalContents = (
      <Stack spacing={2}>
        {to ? <Box>Send message to {to}</Box> : null}
        {providerAutocomplete}
      </Stack>
    );
  }

  const handleFullscreenClose = () => {
    setState((draft) => {
      draft.fullscreen = null;
    });
  };
  const renderEditorParams: RenderEditorParams | null = viewedDefinition
    ? {
        definition: viewedDefinition,
        disabled: Boolean(disabled) || !viewDraft,
        setDefinition: (setter) =>
          setState((draft) => {
            if (!draft.serverState || !viewDraft) {
              return draft;
            }
            draft.serverState.draft = setter(
              draft.serverState.draft ?? draft.serverState.definition,
            );
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
  const getPreviewVisibilityHandler = () => {
    return (
      <>
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
      </>
    );
  };
  const preview = (
    <TemplatePreview
      previewHeader={renderPreviewHeader({
        rendered,
        userProperties: debouncedUserProperties,
      })}
      previewBody={renderPreviewBody({
        rendered,
        userProperties: debouncedUserProperties,
      })}
      visibilityHandler={getPreviewVisibilityHandler()}
      bodyPreviewHeading="Body Preview"
    />
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
          {serverState !== null && !hideTitle && (
            <EditableName
              name={serverState.title}
              variant="h4"
              onChange={(e) =>
                setState((draft) => {
                  if (!draft.serverState) {
                    return;
                  }
                  draft.serverState.title = e.target.value;
                })
              }
            />
          )}

          <InfoTooltip title={USER_PROPERTIES_TOOLTIP}>
            <Typography variant="h5">User Properties</Typography>
          </InfoTooltip>
          <ReactCodeMirror
            value={serverState?.userPropertiesJSON ?? ""}
            onChange={(json) =>
              setState((draft) => {
                if (!draft.serverState) {
                  return;
                }
                draft.serverState.userPropertiesJSON = json;
                const result = jsonParseSafe(json).andThen((p) =>
                  schemaValidateWithErr(p, UserPropertyAssignments),
                );
                if (result.isErr()) {
                  return;
                }
                draft.serverState.userProperties = result.value;
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
          {publisherStatuses && (
            <>
              <PublisherDraftToggle status={publisherStatuses.draftToggle} />
              <Publisher
                status={publisherStatuses.publisher}
                title={template.name}
              />
            </>
          )}
          {/* // FIXME remove */}
          {/* {!hideSaveButton && (
            <Button
              variant="contained"
              onClick={() => handleSave()}
              disabled={errors.size > 0}
            >
              Publish Changes
            </Button>
          )} */}
          <LoadingModal
            openTitle="Send Test Message"
            onSubmit={submitTest}
            onClose={() =>
              setState((draft) => {
                draft.testResponse = null;
              })
            }
          >
            {testModalContents}
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
        {preview}
      </Dialog>
    </>
  );
}
