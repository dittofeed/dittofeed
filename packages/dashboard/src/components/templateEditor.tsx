import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import {
  ContentCopyOutlined,
  Fullscreen,
  FullscreenExit,
  KeyboardDoubleArrowLeftOutlined,
  KeyboardDoubleArrowRightOutlined,
} from "@mui/icons-material";
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
  SxProps,
  TextField,
  Theme,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import ReactCodeMirror from "@uiw/react-codemirror";
import hash from "fnv1a";
import { CHANNEL_IDENTIFIERS } from "isomorphic-lib/src/channels";
import {
  emailProviderLabel,
  getEmailContentsType,
} from "isomorphic-lib/src/email";
import { deepEquals } from "isomorphic-lib/src/equality";
import {
  messageTemplateDefinitionToDraft,
  messageTemplateDraftToDefinition,
} from "isomorphic-lib/src/messageTemplates";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  EmailProviderType,
  EmailProviderTypeSchema,
  InternalEventType,
  JsonResultType,
  MessageTemplateConfiguration,
  MessageTemplateResourceDraft,
  MessageTemplateTestRequest,
  MobilePushProviderType,
  RenderMessageTemplateRequest,
  RenderMessageTemplateRequestContents,
  SmsProviderType,
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

import { useAppStorePick } from "../lib/appStore";
import { copyToClipboard } from "../lib/copyToClipboard";
import {
  noticeAnchorOrigin as anchorOrigin,
  noticeAnchorOrigin,
} from "../lib/notices";
import { useMessageTemplateQuery } from "../lib/useMessageTemplateQuery";
import {
  UpsertMessageTemplateParams,
  useMessageTemplateUpdateMutation,
} from "../lib/useMessageTemplateUpdateMutation";
import { useRenderTemplateQuery } from "../lib/useRenderTemplateQuery";
import {
  TestTemplateVariables,
  useTestTemplateMutation,
} from "../lib/useTestTemplateMutation";
import { useUpdateEffect } from "../lib/useUpdateEffect";
import { useUserPropertiesQuery } from "../lib/useUserPropertiesQuery";
import { EditableTitle } from "./editableName/v2";
import ErrorBoundary from "./errorBoundary";
import { SubtleHeader } from "./headers";
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
import { SettingsCommand, SettingsMenu } from "./settingsMenu";
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

export function getDisabledInputStyles(theme: Theme): SxProps<Theme> {
  const disabledStyles: SxProps<Theme> = {
    "& .MuiInputBase-input.Mui-disabled": {
      WebkitTextFillColor: theme.palette.grey[600],
      color: theme.palette.grey[600],
    },
    '& .MuiFormLabel-root[data-shrink="true"]': {
      color: theme.palette.grey[600],
    },
  };
  return disabledStyles;
}

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
    draft?: MessageTemplateResourceDraft;
  } | null;
  rendered: Record<string, string>;
  isUserPropertiesMinimised: boolean;
}

export interface EmailTemplateState extends BaseTemplateState {
  channel: (typeof ChannelType)["Email"];
  providerOverride: EmailProviderTypeSchema | null;
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
  draft: MessageTemplateResourceDraft;
  userProperties: UserPropertyAssignments;
}

export type RenderPreviewSection = (
  args: RenderPreviewParams,
) => React.ReactNode;

export type SetDraft = (
  setter: (draft: MessageTemplateResourceDraft) => MessageTemplateResourceDraft,
) => void;

export const ModeEnum = {
  Full: "Full",
  EditorPreview: "EditorPreview",
} as const;

export type TemplateEditorMode = (typeof ModeEnum)[keyof typeof ModeEnum];

export interface RenderEditorParams {
  setDraft: SetDraft;
  draft: MessageTemplateResourceDraft;
  disabled: boolean;
  inDraftView: boolean;
}

export type RenderEditorSection = (args: RenderEditorParams) => React.ReactNode;

function errorHash(key: string, message: string) {
  return hash(`${key}-${message}`);
}

export type DraftToPreview = (
  draft: MessageTemplateResourceDraft,
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

function buildTags({
  workspaceId,
  templateId,
  userId,
}: {
  workspaceId: string;
  templateId: string;
  userId?: string;
}): Record<string, string> {
  return {
    journeyId: "sample-journey-id",
    messageId: "sample-message-id",
    nodeId: "sample-node-id",
    runId: "sample-run-id",
    templateId,
    userId: userId ?? "sample-user-id",
    workspaceId,
  };
}

export interface TemplateEditorProps {
  channel: ChannelType;
  templateId: string;
  disabled?: boolean;
  hideTitle?: boolean;
  hidePublisher?: boolean;
  hideUserPropertiesPanel?: boolean;
  hideEditor?: boolean;
  member?: WorkspaceMemberResource;
  renderPreviewHeader: RenderPreviewSection;
  renderPreviewBody: RenderPreviewSection;
  renderEditorHeader: RenderEditorSection;
  renderEditorBody: RenderEditorSection;
  renderEditorOptions?: RenderEditorSection;
  draftToPreview: DraftToPreview;
  fieldToReadable: (field: string) => string | null;
  mode?: TemplateEditorMode;
  defaultIsUserPropertiesMinimised?: boolean;
  messageTemplateConfiguration?: Omit<MessageTemplateConfiguration, "type">;
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
  draftToPreview,
  renderEditorOptions,
  mode = ModeEnum.Full,
  defaultIsUserPropertiesMinimised = false,
  hideUserPropertiesPanel = false,
  hideEditor = false,
  messageTemplateConfiguration,
}: TemplateEditorProps) {
  const theme = useTheme();
  const router = useRouter();
  const { data: userPropertiesResult } = useUserPropertiesQuery();
  const {
    workspace: workspaceResult,
    viewDraft,
    inTransition,
    setViewDraft,
  } = useAppStorePick([
    "workspace",
    "viewDraft",
    "setViewDraft",
    "inTransition",
  ]);
  const { data: template } = useMessageTemplateQuery(templateId);
  const { mutate: updateTemplate, isPending: isUpdating } =
    useMessageTemplateUpdateMutation();
  const testTemplateMutation = useTestTemplateMutation();

  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;
  const initialUserProperties = useMemo(() => {
    if (!userPropertiesResult) {
      return {};
    }
    return getUserPropertyValues({
      member,
      userProperties: userPropertiesResult.userProperties,
    });
  }, [userPropertiesResult, member]);

  const [state, setState] = useImmer<TemplateEditorState>({
    fullscreen: null,
    editedTemplate: null,
    userProperties: initialUserProperties,
    userPropertiesJSON: JSON.stringify(initialUserProperties, null, 2),
    errors: new Map(),
    providerOverride: null,
    channel,
    rendered: {},
    isUserPropertiesMinimised: defaultIsUserPropertiesMinimised,
  });
  useEffect(() => {
    if (
      !template?.definition ||
      state.editedTemplate?.draft?.type !== "Email" ||
      template.definition.type !== "Email"
    ) {
      return;
    }
    const currentEmailContentsType = getEmailContentsType(
      state.editedTemplate.draft,
    );
    const newEmailContentsType = getEmailContentsType(template.definition);
    if (currentEmailContentsType !== newEmailContentsType) {
      // Check if the new email contents type is allowed by configuration
      if (messageTemplateConfiguration?.allowedEmailContentsTypes) {
        const isNewTypeAllowed =
          messageTemplateConfiguration.allowedEmailContentsTypes.includes(
            newEmailContentsType,
          );
        if (!isNewTypeAllowed) {
          // Don't switch modes if the target type is not allowed
          return;
        }
      }

      setState((d) => {
        if (!d.editedTemplate) {
          return d;
        }
        d.editedTemplate.draft = template.draft;
        return d;
      });
    }
  }, [
    template,
    state.editedTemplate,
    setState,
    messageTemplateConfiguration?.allowedEmailContentsTypes,
  ]);

  const {
    fullscreen,
    errors,
    rendered,
    editedTemplate,
    userPropertiesJSON,
    isUserPropertiesMinimised,
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
  }, [initialUserProperties, setState, inTransition]);

  useEffect(() => {
    setState((draft) => {
      if (!template?.definition) {
        return;
      }
      if (!draft.editedTemplate) {
        draft.editedTemplate = {
          title: template.name,
          draft: template.draft,
        };
      } else if (!template.draft) {
        draft.editedTemplate.draft = undefined;
      }
    });
  }, [setState, template]);

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
    const definitionFromDraft = editedTemplate.draft
      ? messageTemplateDraftToDefinition(editedTemplate.draft).unwrapOr(null)
      : null;

    if (
      !definitionFromDraft ||
      deepEquals(definitionFromDraft, template.definition)
    ) {
      const publisher: PublisherUpToDateStatus = {
        type: PublisherStatusType.UpToDate,
      };
      return { publisher, draftToggle: publisher };
    }
    const publisher: PublisherOutOfDateStatus = {
      type: PublisherStatusType.OutOfDate,
      disabled: !viewDraft || errors.size > 0,
      isUpdating,
      onPublish: () => {
        updateTemplate({
          id: templateId,
          name: template.name,
          draft: null,
          definition: definitionFromDraft,
        });
      },
      onRevert: () => {
        updateTemplate({
          id: templateId,
          name: template.name,
          draft: null,
        });
      },
    };

    const draftToggle: PublisherOutOfDateToggleStatus = {
      type: PublisherStatusType.OutOfDate,
      isDraft: viewDraft,
      isUpdating,
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
    isUpdating,
    setViewDraft,
    updateTemplate,
    templateId,
  ]);

  const [debouncedDraft] = useDebounce(editedTemplate?.draft, 300);
  const [debouncedTitle] = useDebounce(editedTemplate?.title, 300);

  useUpdateEffect(() => {
    if (disabled || !workspace || !debouncedTitle) {
      return;
    }
    const updateData: UpsertMessageTemplateParams = {
      id: templateId,
      name: debouncedTitle,
    };
    if (!hidePublisher) {
      if (!deepEquals(debouncedDraft, template?.draft)) {
        updateData.draft = debouncedDraft;
      }
    } else {
      const definitionFromDraft = debouncedDraft
        ? messageTemplateDraftToDefinition(debouncedDraft).unwrapOr(null)
        : null;

      if (
        !definitionFromDraft ||
        deepEquals(definitionFromDraft, template?.definition)
      ) {
        return;
      }
      updateData.definition = definitionFromDraft;
    }

    if (
      updateData.draft !== undefined ||
      updateData.definition !== undefined ||
      debouncedTitle !== template?.name
    ) {
      updateTemplate(updateData);
    }
  }, [debouncedDraft, debouncedTitle]);

  const [debouncedUserProperties] = useDebounce(state.userProperties, 300);

  const draftToRender = useMemo(() => {
    if (debouncedDraft) {
      return debouncedDraft;
    }
    if (template?.draft) {
      return template.draft;
    }
    if (!template?.definition) {
      return null;
    }
    return messageTemplateDefinitionToDraft(template.definition);
  }, [debouncedDraft, template?.draft, template?.definition]);

  const renderHookParams: Omit<
    RenderMessageTemplateRequest,
    "workspaceId"
  > | null = useMemo(() => {
    if (
      !workspace ||
      inTransition ||
      !draftToRender ||
      Object.keys(debouncedUserProperties).length === 0
    ) {
      return null;
    }
    return {
      channel,
      userProperties: debouncedUserProperties,
      tags: buildTags({
        workspaceId: workspace.id,
        templateId,
        userId: debouncedUserProperties.id,
      }),
      contents: draftToPreview(draftToRender),
    };
  }, [
    workspace,
    inTransition,
    draftToRender,
    debouncedUserProperties,
    channel,
    templateId,
    draftToPreview,
  ]);

  const renderQuery = useRenderTemplateQuery(renderHookParams, {
    enabled: !!renderHookParams,
  });

  useEffect(() => {
    if (renderQuery.isError && renderQuery.error) {
      enqueueSnackbar("API Error: failed to render template preview.", {
        variant: "error",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
      return;
    }

    if (renderQuery.data) {
      const { contents } = renderQuery.data;
      const newRendered: Record<string, string> = {};
      const newErrors = new Map(state.errors);

      for (const contentKey in contents) {
        const content = contents[contentKey];
        if (content === undefined) {
          continue;
        }
        const existingErr = state.errors.get(contentKey);
        if (content.type === JsonResultType.Ok) {
          newRendered[contentKey] = content.value;
          if (existingErr) {
            closeSnackbar(errorHash(contentKey, existingErr));
            newErrors.delete(contentKey);
          }
        } else {
          const readable = fieldToReadable(contentKey) ?? contentKey;
          const message = `${readable} Error: ${content.err}`;

          if (existingErr && existingErr !== message) {
            closeSnackbar(errorHash(contentKey, existingErr));
          }
          if (existingErr !== message) {
            enqueueSnackbar(message, {
              variant: "error",
              persist: true,
              key: errorHash(contentKey, message),
              anchorOrigin,
            });
            newErrors.set(contentKey, message);
          } else if (!existingErr) {
            enqueueSnackbar(message, {
              variant: "error",
              persist: true,
              key: errorHash(contentKey, message),
              anchorOrigin,
            });
            newErrors.set(contentKey, message);
          }
        }
      }

      const renderedContentChanged = !deepEquals(state.rendered, newRendered);

      let errorsContentChanged = false;
      if (state.errors.size !== newErrors.size) {
        errorsContentChanged = true;
      } else {
        for (const [key, value] of state.errors.entries()) {
          if (newErrors.get(key) !== value) {
            errorsContentChanged = true;
            break;
          }
        }
        if (!errorsContentChanged) {
          for (const [key, value] of newErrors.entries()) {
            if (state.errors.get(key) !== value) {
              errorsContentChanged = true;
              break;
            }
          }
        }
      }

      if (renderedContentChanged || errorsContentChanged) {
        setState((draft) => {
          if (renderedContentChanged) {
            draft.rendered = newRendered;
          }
          if (errorsContentChanged) {
            draft.errors = newErrors;
          }
        });
      }
    }
  }, [
    renderQuery.data,
    renderQuery.isError,
    renderQuery.error,
    setState,
    errors,
    fieldToReadable,
    state.rendered,
    state.errors,
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
      userPropertiesResult
        ? userPropertiesResult.userProperties.map((p) => p.name)
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

  const renderEditorParams: RenderEditorParams | null = useMemo(() => {
    if (!template?.definition) {
      return null;
    }
    const draft: MessageTemplateResourceDraft | undefined =
      (viewDraft ? editedTemplate?.draft : undefined) ??
      messageTemplateDefinitionToDraft(template.definition);

    const inDraftView =
      publisherStatuses?.publisher.type !== PublisherStatusType.OutOfDate ||
      viewDraft;

    return {
      draft,
      disabled: Boolean(disabled) || !inDraftView,
      inDraftView,
      setDraft: (setter) =>
        setState((stateDraft) => {
          let currentDefinition: MessageTemplateResourceDraft | null = null;
          if (stateDraft.editedTemplate?.draft) {
            currentDefinition = stateDraft.editedTemplate.draft;
          } else if (template.definition) {
            currentDefinition = messageTemplateDefinitionToDraft({
              ...template.definition,
            });
          }

          if (
            !currentDefinition ||
            !stateDraft.editedTemplate ||
            !inDraftView
          ) {
            return stateDraft;
          }
          stateDraft.editedTemplate.draft = setter(currentDefinition);
          return stateDraft;
        }),
    };
  }, [
    disabled,
    editedTemplate?.draft,
    publisherStatuses?.publisher.type,
    setState,
    template?.definition,
    viewDraft,
  ]);

  const commands: SettingsCommand[] = useMemo(() => {
    return [
      {
        label: "Copy template definition as JSON",
        icon: <ContentCopyOutlined />,
        disabled: !template?.definition,
        action: () => {
          copyToClipboard({
            value: JSON.stringify(template?.definition),
            successNotice: "Template definition copied to clipboard as JSON.",
            failureNotice: "Failed to copy template definition.",
          });
        },
      },
    ];
  }, [template?.definition]);

  if (!workspace || !template || !renderEditorParams) {
    return null;
  }

  const submitTestDataBase: Pick<
    MessageTemplateTestRequest,
    "templateId" | "userProperties" | "tags"
  > = {
    templateId,
    userProperties: debouncedUserProperties,
    tags: buildTags({
      workspaceId: workspace.id,
      templateId,
      userId: debouncedUserProperties.id,
    }),
  };
  let submitTestDataVariables: TestTemplateVariables;
  switch (state.channel) {
    case ChannelType.Email:
      submitTestDataVariables = {
        ...submitTestDataBase,
        channel: state.channel,
        provider: state.providerOverride ?? undefined,
      };
      break;
    case ChannelType.Sms:
      submitTestDataVariables = {
        ...submitTestDataBase,
        channel: state.channel,
        provider: state.providerOverride ?? undefined,
      };
      break;
    case ChannelType.MobilePush:
      submitTestDataVariables = {
        ...submitTestDataBase,
        channel: state.channel,
        provider: state.providerOverride ?? undefined,
      };
      break;
    case ChannelType.Webhook:
      submitTestDataVariables = {
        ...submitTestDataBase,
        channel: state.channel,
      };
      break;
    default:
      assertUnreachable(state);
  }

  let testModalContents: React.ReactNode = null;

  if (testTemplateMutation.isSuccess && testTemplateMutation.data) {
    const testResponseData = testTemplateMutation.data;
    if (
      testResponseData.type === JsonResultType.Ok &&
      testResponseData.value.type === InternalEventType.MessageSent &&
      testResponseData.value.variant.type === channel
    ) {
      const { to } = testResponseData.value.variant;
      let responseEl: React.ReactNode | null = null;
      if (testResponseData.value.variant.type === ChannelType.Webhook) {
        const { response: webhookResponseData } =
          testResponseData.value.variant;
        responseEl = (
          <Stack spacing={1}>
            <SubtleHeader>Response</SubtleHeader>
            <ReactCodeMirror
              value={JSON.stringify(webhookResponseData, null, 2)}
              height="100%"
              readOnly
              editable={false}
              extensions={[
                codeMirrorJson(),
                linter(jsonParseLinter()),
                EditorView.lineWrapping,
                EditorView.editable.of(false),
                EditorView.theme({
                  "&": { fontFamily: theme.typography.fontFamily },
                }),
                lintGutter(),
              ]}
            />
          </Stack>
        );
      }
      testModalContents = (
        <>
          <Alert severity="success">
            Message was sent successfully to {to}
          </Alert>
          {responseEl}
        </>
      );
    } else if (testResponseData.type === JsonResultType.Err) {
      testModalContents = (
        <Stack spacing={1}>
          <Alert severity="error">
            Failed to send test message. Suggestions:
          </Alert>
          {testResponseData.err.suggestions.map((suggestion, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Alert key={i} severity="warning">
              {suggestion}
            </Alert>
          ))}
          {testResponseData.err.responseData && (
            <ReactCodeMirror
              value={testResponseData.err.responseData}
              height="100%"
              readOnly
              editable={false}
              extensions={[
                codeMirrorJson(),
                linter(jsonParseLinter()),
                EditorView.lineWrapping,
                EditorView.editable.of(false),
                EditorView.theme({
                  "&": { fontFamily: theme.typography.fontFamily },
                }),
                lintGutter(),
              ]}
            />
          )}
        </Stack>
      );
    }
  } else if (testTemplateMutation.isError && testTemplateMutation.error) {
    testModalContents = (
      <Alert severity="error">
        API Error: Failed to attempt test message.{" "}
        {testTemplateMutation.error.message}
      </Alert>
    );
  } else {
    let to: string | null = null;
    if (channel === ChannelType.Webhook) {
      if (draftToRender?.type === ChannelType.Webhook) {
        to =
          (debouncedUserProperties[draftToRender.identifierKey] as
            | string
            | null) ?? null;
      }
    } else {
      const identiferKey = CHANNEL_IDENTIFIERS[channel];
      to = debouncedUserProperties[identiferKey] ?? null;
    }
    let providerAutocomplete: React.ReactNode;
    switch (state.channel) {
      case ChannelType.Email:
        {
          const providerOptions: {
            id: EmailProviderTypeSchema;
            label: string;
          }[] = Object.values(EmailProviderType).map((type) => ({
            id: type,
            label: emailProviderLabel(type),
          }));
          providerAutocomplete = (
            <ProviderOverrideSelector<EmailProviderTypeSchema>
              value={state.providerOverride}
              options={providerOptions}
              onChange={(value) => {
                setState((draft) => {
                  if (draft.channel === ChannelType.Email)
                    draft.providerOverride = value;
                });
              }}
            />
          );
        }
        break;
      case ChannelType.Sms:
        {
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
                  if (draft.channel === ChannelType.Sms)
                    draft.providerOverride = value;
                });
              }}
            />
          );
        }
        break;
      case ChannelType.MobilePush:
        {
          const providerOptions: {
            id: MobilePushProviderType;
            label: string;
          }[] = Object.values(MobilePushProviderType).map((type) => ({
            id: type,
            label: type,
          }));
          providerAutocomplete = (
            <ProviderOverrideSelector<MobilePushProviderType>
              value={state.providerOverride}
              options={providerOptions}
              onChange={(value) => {
                setState((draft) => {
                  if (draft.channel === ChannelType.MobilePush)
                    draft.providerOverride = value;
                });
              }}
            />
          );
        }
        break;
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
  const handleUserPropertiesToggle = () => {
    setState((draft) => {
      draft.isUserPropertiesMinimised = !draft.isUserPropertiesMinimised;
    });
  };

  if (!template.definition) {
    return null;
  }

  const editor = (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
      spacing={1}
    >
      <Stack>{renderEditorHeader(renderEditorParams)}</Stack>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        className="editor-header"
        sx={{
          height: "36px",
        }}
      >
        {mode === ModeEnum.Full ? (
          <FormLabel sx={{ paddingLeft: 1 }}>Body Message</FormLabel>
        ) : (
          editedTemplate?.title && (
            <EditableTitle
              text={editedTemplate.title}
              disabled={disabled}
              onSubmit={(val) =>
                setState((draft) => {
                  if (!draft.editedTemplate) {
                    return;
                  }
                  draft.editedTemplate.title = val;
                })
              }
            />
          )
        )}
        <Stack direction="row" spacing={1}>
          {renderEditorOptions && renderEditorOptions(renderEditorParams)}
          <SettingsMenu commands={commands} />
          {fullscreen === null ? (
            <Stack direction="row" alignItems="center" spacing={2}>
              <IconButton
                size="small"
                onClick={() =>
                  setState((stateDraft) => {
                    stateDraft.fullscreen = "editor";
                  })
                }
              >
                <Fullscreen />
              </IconButton>
            </Stack>
          ) : (
            <IconButton size="small" onClick={handleFullscreenClose}>
              <FullscreenExit />
            </IconButton>
          )}
        </Stack>
      </Stack>
      <BodyBox
        direction="left"
        className="editor-body"
        sx={{ backgroundColor: "white" }}
      >
        <ErrorBoundary>{renderEditorBody(renderEditorParams)}</ErrorBoundary>
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
              setState((stateDraft) => {
                stateDraft.fullscreen = "preview";
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
  const preview = draftToRender ? (
    <TemplatePreview
      previewHeader={renderPreviewHeader({
        rendered,
        draft: draftToRender,
        userProperties: debouncedUserProperties,
      })}
      previewBody={renderPreviewBody({
        rendered,
        userProperties: debouncedUserProperties,
        draft: draftToRender,
      })}
      visibilityHandler={getPreviewVisibilityHandler()}
      bodyPreviewHeading="Body Preview"
    />
  ) : null;
  const userPropertiesPanel = mode === ModeEnum.Full && (
    <Stack
      direction="column"
      spacing={2}
      sx={{
        borderTopRightRadius: 1,
        width: isUserPropertiesMinimised ? "fit-content" : "25%",
        padding: 1,
        border: `1px solid ${theme.palette.grey[200]}`,
        boxShadow: theme.shadows[2],
        minHeight: 0,
      }}
    >
      <Stack
        direction="row"
        justifyContent={isUserPropertiesMinimised ? "center" : "space-between"}
        spacing={2}
      >
        {editedTemplate !== null &&
          !hideTitle &&
          !isUserPropertiesMinimised && (
            <EditableTitle
              text={editedTemplate.title}
              disabled={disabled}
              onSubmit={(val) =>
                setState((draft) => {
                  if (!draft.editedTemplate) {
                    return;
                  }
                  draft.editedTemplate.title = val;
                })
              }
            />
          )}
        <Tooltip
          title={
            isUserPropertiesMinimised
              ? "Maximize user properties pane"
              : "Minimize user properties pane"
          }
        >
          <IconButton onClick={() => handleUserPropertiesToggle()}>
            {!isUserPropertiesMinimised && (
              <KeyboardDoubleArrowLeftOutlined
                sx={{
                  border: `2px solid ${theme.palette.grey[600]}`,
                  borderRadius: "50%",
                }}
              />
            )}
            {isUserPropertiesMinimised && (
              <KeyboardDoubleArrowRightOutlined
                sx={{
                  border: `2px solid ${theme.palette.grey[600]}`,
                  borderRadius: "50%",
                }}
              />
            )}
          </IconButton>
        </Tooltip>
      </Stack>

      {publisherStatuses && (
        <>
          <PublisherDraftToggle
            status={publisherStatuses.draftToggle}
            isMinimised={isUserPropertiesMinimised}
          />
          <Publisher
            status={publisherStatuses.publisher}
            title={template.name}
            isMinimised={isUserPropertiesMinimised}
          />
        </>
      )}

      <LoadingModal
        isMinimised={isUserPropertiesMinimised}
        openTitle="Send Test Message"
        loading={testTemplateMutation.isPending}
        submitTitle={
          testTemplateMutation.isError
            ? "Retry"
            : testTemplateMutation.isPending || testTemplateMutation.isSuccess
              ? "Re-Submit"
              : "Submit"
        }
        onSubmit={() => {
          testTemplateMutation.mutate(submitTestDataVariables, {
            onSuccess: (data) => {
              if (data.type === JsonResultType.Ok) {
                if (data.value.type === InternalEventType.MessageSent) {
                  enqueueSnackbar(
                    `Test message sent successfully to ${data.value.variant.to}.`,
                    { variant: "success", anchorOrigin },
                  );
                } else {
                  enqueueSnackbar(
                    "Test message processed (e.g., skipped). See modal for details.",
                    { variant: "info", anchorOrigin },
                  );
                }
              } else {
                enqueueSnackbar(
                  "Failed to send test message. See modal for details.",
                  { variant: "error", anchorOrigin },
                );
              }
            },
            onError: (error) => {
              enqueueSnackbar(`API Error sending test: ${error.message}`, {
                variant: "error",
                anchorOrigin,
              });
            },
          });
        }}
        onClose={() => {
          testTemplateMutation.reset();
        }}
      >
        {testModalContents}
      </LoadingModal>
      {!isUserPropertiesMinimised && (
        <>
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
        </>
      )}
    </Stack>
  );

  return (
    <>
      <Stack
        direction="row"
        sx={{
          height: "100%",
          width: "100%",
        }}
        spacing={1}
      >
        {!hideUserPropertiesPanel && userPropertiesPanel}
        <Stack direction="row" sx={{ flex: 1 }}>
          {!hideEditor && (
            <Box
              sx={{
                width: "50%",
              }}
            >
              {editor}
            </Box>
          )}
          <Divider orientation="vertical" />
          <Box
            sx={{
              width: hideEditor ? "100%" : "50%",
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
