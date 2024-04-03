import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Fullscreen, FullscreenExit } from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
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
import { deepEquals } from "isomorphic-lib/src/equality";
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
import React, { useEffect, useMemo } from "react";
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
  PublisherUpToDateStatus,
} from "./publisher";
import TemplatePreview from "./templatePreview";

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
  userProperties: UserPropertyAssignments;
  userPropertiesJSON: string;
  editedTemplate: {
    title: string;
    draft?: MessageTemplateResourceDefinition;
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
  hidePublisher,
  disabled,
  member,
  hideTitle,
  fieldToReadable,
  definitionToPreview,
}: {
  channel: ChannelType;
  templateId: string;
  disabled?: boolean;
  hideTitle?: boolean;
  hidePublisher?: boolean;
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
    upsertTemplate,
    viewDraft,
    inTransition,
    setViewDraft,
  } = useAppStorePick([
    "apiBase",
    "messages",
    "workspace",
    "userProperties",
    "upsertTemplate",
    "viewDraft",
    "setViewDraft",
    "inTransition",
  ]);
  const template = useMemo(
    () =>
      messages.type === CompletionStatus.Successful
        ? messages.value.find((m) => m.id === templateId)
        : undefined,
    [messages, templateId],
  );

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
    editedTemplate: null,
    userProperties: initialUserProperties,
    userPropertiesJSON: JSON.stringify(initialUserProperties, null, 2),
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
    editedTemplate,
    userProperties,
    userPropertiesJSON,
  } = state;

  // Set server state post page transition for CSR
  useEffect(() => {
    if (inTransition) {
      return;
    }
    setState((draft) => {
      draft.userProperties = initialUserProperties;
      draft.userPropertiesJSON = JSON.stringify(initialUserProperties, null, 2);
    });
  }, [
    initialUserProperties,
    setState,
    inTransition,
    template,
    viewDraft,
    editedTemplate,
  ]);

  useEffect(() => {
    setState((draft) => {
      if (!template?.definition) {
        return;
      }
      draft.editedTemplate = {
        draft: template.draft,
        title: template.name,
      };
    });
  }, [setState, template]);

  // FIXME toggling deletes draft
  const publisherStatuses: {
    publisher: PublisherStatus;
    draftToggle: PublisherDraftToggleStatus;
  } | null = useMemo(() => {
    if (hidePublisher) {
      return null;
    }
    if (!template?.definition || !editedTemplate) {
      return null;
    }
    if (
      !editedTemplate.draft ||
      deepEquals(editedTemplate.draft, template.definition)
    ) {
      const publisher: PublisherUpToDateStatus = {
        type: PublisherStatusType.UpToDate,
      };
      return { publisher, draftToggle: publisher };
    }
    const publisher: PublisherOutOfDateStatus = {
      type: PublisherStatusType.OutOfDate,
      disabled: !viewDraft || errors.size > 0,
      onPublish: () => {
        if (!workspace) {
          return;
        }
        apiRequestHandlerFactory({
          request: updateRequest,
          setRequest: (request) =>
            setState((draft) => {
              draft.updateRequest = request;
            }),
          responseSchema: MessageTemplateResource,
          setResponse: upsertTemplate,
          onSuccessNotice: "Published template draft.",
          onFailureNoticeHandler: () =>
            `API Error: Failed to publish template draft.`,
          requestConfig: {
            method: "PUT",
            url: `${apiBase}/api/content/templates`,
            data: {
              workspaceId: workspace.id,
              name: template.name,
              id: template.id,
              draft: null,
              definition: editedTemplate.draft,
            } satisfies UpsertMessageTemplateResource,
            headers: {
              "Content-Type": "application/json",
            },
          },
        })();
      },
      onRevert: () => {
        if (!workspace) {
          return;
        }
        apiRequestHandlerFactory({
          request: updateRequest,
          setRequest: (request) =>
            setState((draft) => {
              draft.updateRequest = request;
            }),
          responseSchema: MessageTemplateResource,
          setResponse: upsertTemplate,
          onSuccessNotice: "Reverted template draft.",
          onFailureNoticeHandler: () =>
            `API Error: Failed to revert template draft.`,
          requestConfig: {
            method: "PUT",
            url: `${apiBase}/api/content/templates`,
            data: {
              workspaceId: workspace.id,
              name: template.name,
              id: template.id,
              draft: null,
            } satisfies UpsertMessageTemplateResource,
            headers: {
              "Content-Type": "application/json",
            },
          },
        })();
      },
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
    hidePublisher,
    template,
    editedTemplate,
    viewDraft,
    errors.size,
    updateRequest,
    workspace,
    upsertTemplate,
    apiBase,
    setState,
    setViewDraft,
  ]);

  const [debouncedDraft] = useDebounce(editedTemplate?.draft, 300);

  useUpdateEffect(() => {
    if (
      disabled ||
      workspaceResult.type !== CompletionStatus.Successful ||
      !editedTemplate
    ) {
      return;
    }
    const workspaceId = workspaceResult.value.id;
    const updateData: UpsertMessageTemplateResource = {
      id: templateId,
      workspaceId,
      name: editedTemplate.title,
    };
    if (!hidePublisher) {
      if (deepEquals(debouncedDraft, template?.draft)) {
        return;
      }
      updateData.draft = debouncedDraft;
    } else {
      if (deepEquals(debouncedDraft, template?.definition)) {
        return;
      }
      updateData.definition = debouncedDraft;
    }

    apiRequestHandlerFactory({
      request: updateRequest,
      setRequest: (request) =>
        setState((draft) => {
          draft.updateRequest = request;
        }),
      responseSchema: MessageTemplateResource,
      setResponse: upsertTemplate,
      onFailureNoticeHandler: () => `API Error: Failed to update template.`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/content/templates`,
        data: updateData,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  }, [debouncedDraft]);

  const [debouncedUserProperties] = useDebounce(userProperties, 300);

  useEffect(() => {
    (async () => {
      if (!workspace || !debouncedDraft || inTransition || !template) {
        return;
      }
      const definitionToRender = viewDraft
        ? debouncedDraft
        : template.definition;

      if (!definitionToRender) {
        return;
      }

      const data: RenderMessageTemplateRequest = {
        workspaceId: workspace.id,
        channel,
        userProperties: debouncedUserProperties,
        contents: definitionToPreview(definitionToRender),
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
    debouncedDraft,
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
      if (debouncedDraft?.type === ChannelType.Webhook) {
        to = debouncedUserProperties[debouncedDraft.identifierKey] ?? null;
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

  if (!template.definition) {
    return null;
  }
  const viewedDefinition =
    (viewDraft ? editedTemplate?.draft : undefined) ?? template.definition;
  const inDraftView =
    publisherStatuses?.publisher.type !== PublisherStatusType.OutOfDate ||
    viewDraft;
  const renderEditorParams: RenderEditorParams = {
    definition: viewedDefinition,
    disabled: Boolean(disabled) || !inDraftView,
    setDefinition: (setter) =>
      setState((draft) => {
        let currentDefinition: MessageTemplateResourceDefinition | null = null;
        if (draft.editedTemplate?.draft) {
          currentDefinition = draft.editedTemplate.draft;
        } else if (template.definition) {
          // Read only object can't be passed into setter, so need to clone.
          currentDefinition = { ...template.definition };
        }

        if (!currentDefinition || !draft.editedTemplate || !inDraftView) {
          return draft;
        }
        draft.editedTemplate.draft = setter(currentDefinition);
        return draft;
      }),
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
            minHeight: 0,
          }}
        >
          {editedTemplate !== null && !hideTitle && (
            <EditableName
              name={editedTemplate.title}
              variant="h4"
              onChange={(e) =>
                setState((draft) => {
                  if (!draft.editedTemplate) {
                    return;
                  }
                  draft.editedTemplate.title = e.target.value;
                })
              }
            />
          )}

          {publisherStatuses && (
            <>
              <PublisherDraftToggle status={publisherStatuses.draftToggle} />
              <Publisher
                status={publisherStatuses.publisher}
                title={template.name}
              />
            </>
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
            {testModalContents}
          </LoadingModal>
          <InfoTooltip title={USER_PROPERTIES_TOOLTIP}>
            <Typography variant="h5">User Properties</Typography>
          </InfoTooltip>
          <Box
            sx={{
              flex: 1,
              display: "flex",
              minHeight: 0,
            }}
          >
            <ReactCodeMirror
              value={userPropertiesJSON}
              height="100%"
              onChange={(json) =>
                setState((draft) => {
                  if (!draft.editedTemplate) {
                    return;
                  }
                  draft.userPropertiesJSON = json;
                  const result = jsonParseSafe(json).andThen((p) =>
                    schemaValidateWithErr(p, UserPropertyAssignments),
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
          </Box>
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
