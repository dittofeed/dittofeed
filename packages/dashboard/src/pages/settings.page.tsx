import {
  ContentCopyOutlined,
  Mail,
  SimCardDownload,
  SmsOutlined,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { LoadingButton } from "@mui/lab";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { createWriteKey, getWriteKeys } from "backend-lib/src/auth";
import { HUBSPOT_INTEGRATION } from "backend-lib/src/constants";
import { generateSecureKey } from "backend-lib/src/crypto";
import { findAllEnrichedIntegrations } from "backend-lib/src/integrations";
import logger from "backend-lib/src/logger";
import { toSegmentResource } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { SubscriptionChange } from "backend-lib/src/types";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import {
  SENDGRID_SECRET,
  SENDGRID_WEBHOOK_SECRET_NAME,
} from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  DataSourceConfigurationResource,
  DataSourceVariantType,
  EmailProviderResource,
  EmailProviderType,
  EphemeralRequestStatus,
  IntegrationResource,
  IntegrationType,
  PersistedEmailProvider,
  SegmentResource,
  SmsProviderConfig,
  SmsProviderType,
  SyncIntegration,
  TwilioSmsProvider,
  UpsertDataSourceConfigurationResource,
  UpsertEmailProviderResource,
  UpsertIntegrationResource,
  UpsertSmsProviderRequest,
} from "isomorphic-lib/src/types";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";
import { enqueueSnackbar } from "notistack";
import { useMemo, useState } from "react";
import { pick } from "remeda/dist/commonjs/pick";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import ExternalLink from "../components/externalLink";
import Fields from "../components/form/Fields";
import { FieldComponents } from "../components/form/types";
import { HubspotIcon } from "../components/icons/hubspotIcon";
import InfoBox from "../components/infoBox";
import Layout from "../components/layout";
import { MenuItemGroup } from "../components/menuItems/types";
import { SubscriptionManagement } from "../components/subscriptionManagement";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore, useAppStorePick } from "../lib/appStore";
import { noticeAnchorOrigin } from "../lib/notices";
import prisma from "../lib/prisma";
import { requestContext } from "../lib/requestContext";
import { useSecretsEditor } from "../lib/secretEditor";
import { PreloadedState, PropsWithInitialState } from "../lib/types";

function SectionHeader({
  id,
  title,
  description,
}: {
  id?: string;
  title: string;
  description?: string;
}) {
  return (
    <Box id={id}>
      <Typography
        variant="h2"
        fontWeight={300}
        sx={{ fontSize: 20, marginBottom: 0.5 }}
      >
        {title}
      </Typography>
      <Typography variant="subtitle1" fontWeight="normal" sx={{ opacity: 0.6 }}>
        {description}
      </Typography>
    </Box>
  );
}

function SectionSubHeader({
  id,
  title,
  description,
}: {
  id?: string;
  title: string;
  description?: string;
}) {
  return (
    <Box id={id}>
      <Typography
        fontWeight={300}
        variant="h2"
        sx={{ fontSize: 16, marginBottom: 0.5 }}
      >
        {title}
      </Typography>
      <Typography variant="subtitle1" fontWeight="normal" sx={{ opacity: 0.6 }}>
        {description}
      </Typography>
    </Box>
  );
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const { workspace } = dfContext;
    const workspaceId = workspace.id;

    const [
      emailProviders,
      defaultEmailProviderRecord,
      subscriptionGroups,
      writeKey,
      integrations,
      segments,
      smsProviders,
    ] = await Promise.all([
      (
        await prisma().emailProvider.findMany({
          where: { workspaceId },
        })
      ).map(({ id, type, apiKey }) => {
        let providerType: EmailProviderType;
        switch (type) {
          case "SendGrid":
            providerType = EmailProviderType.Sendgrid;
            break;
          default:
            throw new Error("Unknown email provider type");
        }
        return {
          type: providerType,
          id,
          apiKey: apiKey ?? undefined,
          workspaceId,
        };
      }),
      prisma().defaultEmailProvider.findFirst({
        where: { workspaceId },
      }),
      prisma().subscriptionGroup.findMany({
        where: {
          workspaceId,
        },
      }),
      getWriteKeys({ workspaceId }).then((keys) => keys[0]),
      findAllEnrichedIntegrations(workspaceId),
      prisma()
        .segment.findMany({
          where: { workspaceId, resourceType: "Declarative" },
        })
        .then((dbSegments) =>
          dbSegments.map((segment) => unwrap(toSegmentResource(segment)))
        ),
      prisma().smsProvider.findMany({
        where: {
          workspaceId,
        },
        include: {
          secret: true,
        },
      }),
    ]);

    const serverInitialState: PreloadedState = {
      emailProviders: {
        type: CompletionStatus.Successful,
        value: emailProviders,
      },
      defaultEmailProvider: {
        type: CompletionStatus.Successful,
        value: defaultEmailProviderRecord,
      },
      integrations: unwrap(integrations).map((i) =>
        pick(i, ["id", "name", "workspaceId", "definition", "enabled"])
      ),
      segments: {
        type: CompletionStatus.Successful,
        value: segments,
      },
    };

    if (writeKey) {
      serverInitialState.writeKeys = [writeKey];
    } else {
      serverInitialState.writeKeys = [
        await createWriteKey({
          workspaceId,
          writeKeyName: "default-write-key",
          writeKeyValue: generateSecureKey(8),
        }),
      ];
    }

    const subscriptionGroupResources = subscriptionGroups.map(
      subscriptionGroupToResource
    );

    serverInitialState.subscriptionGroups = subscriptionGroupResources;
    serverInitialState.smsProviders = smsProviders.flatMap((provider) => {
      const configResult = schemaValidateWithErr(
        provider.secret.configValue,
        SmsProviderConfig
      );
      if (configResult.isErr()) {
        logger().error(
          {
            err: configResult.error,
          },
          "failed to validate sms provider config"
        );
        return [];
      }

      return configResult.value;
    });

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState,
        props: {},
      }),
    };
  });

const settingsSectionIds = {
  segmentSource: "segment-source",
  emailChannel: "email-channel",
  smsChannel: "sms-channel",
  subscription: "subscriptions",
  authentication: "authentication",
  hubspotIntegration: "hubspot-integration",
} as const;

const menuItems: MenuItemGroup[] = [
  {
    id: "data-sources",
    title: "Data Sources",
    type: "group",
    children: [
      {
        id: "data-sources-segment-io",
        title: "Segment",
        type: "item",
        url: `/settings#${settingsSectionIds.segmentSource}`,
        icon: SimCardDownload,
        description: "",
      },
    ],
  },
  {
    id: "message-channels",
    title: "Messaging Channels",
    type: "group",
    children: [
      {
        id: "email",
        title: "Email",
        type: "item",
        url: `/settings#${settingsSectionIds.emailChannel}`,
        icon: Mail,
        description:
          "Configure email settings, including the email provider credentials.",
      },
      {
        id: "sms",
        title: "SMS",
        type: "item",
        url: `/settings#${settingsSectionIds.smsChannel}`,
        icon: SmsOutlined,
        description:
          "Configure email settings, including the email provider credentials.",
      },
    ],
  },
  {
    id: "subscription-management",
    title: "Subscription Management",
    type: "group",
    children: [],
    url: `/settings#${settingsSectionIds.subscription}`,
  },
  {
    id: "authentication",
    title: "Authentication",
    type: "group",
    children: [],
    url: `/settings#${settingsSectionIds.authentication}`,
  },
  {
    id: "integrations",
    title: "Integrations",
    type: "group",
    children: [
      {
        id: "hubspot",
        title: "Hubspot",
        type: "item",
        url: `/settings#${settingsSectionIds.hubspotIntegration}`,
        icon: HubspotIcon,
        description: "Configure Hubspot integration.",
      },
    ],
    url: `/settings#${settingsSectionIds.hubspotIntegration}`,
  },
];

function SettingsLayout(
  props: Omit<React.ComponentProps<typeof Layout>, "items">
) {
  return (
    <Layout
      pageTitle="Settings"
      backLink="/"
      navigationRenderer="minimal"
      items={menuItems}
      {...props}
    />
  );
}

interface SettingsState {
  sendgridProviderRequest: EphemeralRequestStatus<Error>;
  sendgridProviderApiKey: string;
  sendgridWebhookVerificationKeyRequest: EphemeralRequestStatus<Error>;
  sendgridWebhookVerificationKey: string;
  upsertSmsProviderRequest: EphemeralRequestStatus<Error>;
  segmentIoRequest: EphemeralRequestStatus<Error>;
  segmentIoSharedSecret: string;
  upsertIntegrationsRequest: EphemeralRequestStatus<Error>;
}

interface SettingsActions {
  updateSendgridProviderApiKey: (key: string) => void;
  updateSendgridProviderRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
  updateSegmentIoSharedSecret: (key: string) => void;
  updateSegmentIoRequest: (request: EphemeralRequestStatus<Error>) => void;
  updateSendgridWebhookVerificationKey: (key: string) => void;
  updateSendgridWebhookVerificationRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
  updateUpsertIntegrationsRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
  updateSmsProviderRequest: (request: EphemeralRequestStatus<Error>) => void;
}

type SettingsContent = SettingsState & SettingsActions;

export const useSettingsStore = create(
  immer<SettingsActions & SettingsState>((set) => ({
    segmentIoRequest: {
      type: CompletionStatus.NotStarted,
    },
    segmentIoSharedSecret: "",
    sendgridProviderRequest: {
      type: CompletionStatus.NotStarted,
    },
    sendgridProviderApiKey: "",
    sendgridFromEmail: "",
    sendgridWebhookVerificationKey: "",
    sendgridWebhookVerificationKeyRequest: {
      type: CompletionStatus.NotStarted,
    },
    upsertIntegrationsRequest: {
      type: CompletionStatus.NotStarted,
    },
    upsertSmsProviderRequest: {
      type: CompletionStatus.NotStarted,
    },
    updateUpsertIntegrationsRequest: (request) => {
      set((state) => {
        state.upsertIntegrationsRequest = request;
      });
    },
    updateSendgridProviderApiKey: (key) => {
      set((state) => {
        state.sendgridProviderApiKey = key;
      });
    },
    updateSendgridProviderRequest: (request) => {
      set((state) => {
        state.sendgridProviderRequest = request;
      });
    },
    updateSendgridWebhookVerificationKey: (key) => {
      set((state) => {
        state.sendgridWebhookVerificationKey = key;
      });
    },
    updateSendgridWebhookVerificationRequest: (request) => {
      set((state) => {
        state.sendgridWebhookVerificationKeyRequest = request;
      });
    },
    updateSegmentIoSharedSecret: (key) => {
      set((state) => {
        state.segmentIoSharedSecret = key;
      });
    },
    updateSegmentIoRequest: (request) => {
      set((state) => {
        state.segmentIoRequest = request;
      });
    },
    updateSmsProviderRequest: (request) => {
      set((state) => {
        state.upsertSmsProviderRequest = request;
      });
    },
  }))
);

function useSettingsStorePick(params: (keyof SettingsContent)[]) {
  return useSettingsStore((store) => pick(store, params));
}

function SegmentIoConfig() {
  const sharedSecret = useSettingsStore((store) => store.segmentIoSharedSecret);
  const [isEnabled, setIsEnabled] = useState(!!sharedSecret.trim());
  const segmentIoRequest = useSettingsStore((store) => store.segmentIoRequest);
  const apiBase = useAppStore((store) => store.apiBase);
  const updateSegmentIoRequest = useSettingsStore(
    (store) => store.updateSegmentIoRequest
  );
  const workspace = useAppStore((store) => store.workspace);
  const upsertDataSourceConfiguration = useAppStore(
    (store) => store.upsertDataSourceConfiguration
  );
  const updateSegmentIoSharedSecret = useSettingsStore(
    (store) => store.updateSegmentIoSharedSecret
  );
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  if (!workspaceId) {
    return null;
  }
  const body: UpsertDataSourceConfigurationResource = {
    workspaceId,
    variant: {
      type: DataSourceVariantType.SegmentIO,
      sharedSecret,
    },
  };
  const apiHandler = apiRequestHandlerFactory({
    request: segmentIoRequest,
    setRequest: updateSegmentIoRequest,
    responseSchema: DataSourceConfigurationResource,
    setResponse: upsertDataSourceConfiguration,
    onSuccessNotice: "Updated segment.com configuration.",
    onFailureNoticeHandler: () =>
      `API Error: Failed to update segment.com configuration.`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/settings/data-sources`,
      data: body,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });
  const handleSubmit = () => {
    if (!isEnabled) updateSegmentIoSharedSecret("");
    apiHandler();
  };

  const requestInProgress =
    segmentIoRequest.type === CompletionStatus.InProgress;

  return (
    <Stack spacing={3}>
      <SectionHeader
        id={settingsSectionIds.segmentSource}
        title="Data Sources"
        description="In order to use Dittofeed, at least 1 source of user data must be configured."
      />
      <Fields
        sections={[
          {
            id: "data-sources-section-1",
            fieldGroups: [
              {
                id: "segment-io-fields",
                name: "Segment.io",
                fields: [
                  {
                    id: "enable-segment-io",
                    type: "toggle",
                    fieldProps: {
                      labelProps: {
                        label: "Enable",
                      },
                      switchProps: {
                        value: isEnabled,
                        onChange: (_, checked) => {
                          setIsEnabled(checked);
                        },
                      },
                    },
                  },
                  ...(isEnabled
                    ? ([
                        {
                          id: "shared-secret",
                          type: "text",
                          fieldProps: {
                            label: "Shared Secret",
                            helperText:
                              "Secret for validating signed request bodies from segment.",
                            onChange: (e) => {
                              updateSegmentIoSharedSecret(e.target.value);
                            },
                            value: sharedSecret,
                          },
                        },
                      ] as FieldComponents[])
                    : []),
                ],
              },
            ],
          },
        ]}
      >
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={requestInProgress}
          sx={{
            alignSelf: {
              xs: "start",
              sm: "end",
            },
          }}
        >
          Save
        </Button>
      </Fields>
    </Stack>
  );
}

function SendGridConfig() {
  const {
    emailProviders,
    apiBase,
    workspace: workspaceResult,
    upsertEmailProvider,
  } = useAppStorePick([
    "emailProviders",
    "apiBase",
    "workspace",
    "upsertEmailProvider",
  ]);
  const apiKey = useSettingsStore((store) => store.sendgridProviderApiKey);
  const sendgridProviderRequest = useSettingsStore(
    (store) => store.sendgridProviderRequest
  );
  const updateSendgridProviderRequest = useSettingsStore(
    (store) => store.updateSendgridProviderRequest
  );
  const updateSendgridProviderApiKey = useSettingsStore(
    (store) => store.updateSendgridProviderApiKey
  );
  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;

  const savedSendgridProvider: EmailProviderResource | null = useMemo(() => {
    if (emailProviders.type !== CompletionStatus.Successful || !workspace?.id) {
      return null;
    }
    for (const emailProvider of emailProviders.value) {
      if (
        emailProvider.workspaceId === workspace.id &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        emailProvider.type === EmailProviderType.Sendgrid
      ) {
        return emailProvider;
      }
    }
    return null;
  }, [emailProviders, workspace]);
  const webhookKeyEditor = useSecretsEditor({
    secretName: SENDGRID_WEBHOOK_SECRET_NAME,
  });

  if (!workspace || !webhookKeyEditor) {
    return null;
  }

  const body: UpsertEmailProviderResource = {
    id: savedSendgridProvider?.id,
    apiKey,
    type: EmailProviderType.Sendgrid,
    workspaceId: workspace.id,
  };
  const submitApiKey = apiRequestHandlerFactory({
    request: sendgridProviderRequest,
    setRequest: updateSendgridProviderRequest,
    responseSchema: PersistedEmailProvider,
    setResponse: upsertEmailProvider,
    onSuccessNotice: "Updated sendgrid configuration.",
    onFailureNoticeHandler: () =>
      "API Error: Failed to update sendgrid configuration.",
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/settings/email-providers`,
      data: body,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  const {
    showPassword: showWebhookKey,
    secretValue: webhookKey,
    setSecretValue: setWebhookKey,
    secretApiHandler: submitWebhookKey,
    handleClickShowPassword,
    handleMouseDownPassword,
    upsertSecretRequest,
  } = webhookKeyEditor;
  const requestInProgress =
    sendgridProviderRequest.type === CompletionStatus.InProgress ||
    upsertSecretRequest.type === CompletionStatus.InProgress;

  const onSubmit = () => {
    if (webhookKey) {
      submitWebhookKey();
    }
    if (apiKey) {
      submitApiKey();
    }
  };

  return (
    <Fields
      sections={[
        {
          id: "sendgrid-section",
          fieldGroups: [
            {
              id: "sendgrid-fields",
              name: "SendGrid",
              fields: [
                {
                  id: "sendgrid-api-key-2",
                  type: "secret",
                  fieldProps: {
                    name: SENDGRID_SECRET,
                    key: "apiKey",
                    title: "SendGrid API Key",
                    saved: false,
                  },
                },
                {
                  id: "sendgrid-api-key",
                  type: "text",
                  fieldProps: {
                    label: "API Key",
                    helperText:
                      "API key, used internally by Dittofeed to send emails via sendgrid.",
                    onChange: (e) => {
                      updateSendgridProviderApiKey(e.target.value);
                    },
                    value: apiKey,
                  },
                },
                {
                  id: "sendgrid-webhook-key",
                  type: "text",
                  fieldProps: {
                    label: "Webhook Key",
                    helperText:
                      "Sendgrid webhook verification key, used to authenticate sendgrid webhook requests.",
                    variant: "outlined",
                    type: showWebhookKey ? "text" : "password",
                    placeholder: showWebhookKey ? undefined : "**********",
                    onChange: (e) => setWebhookKey(e.target.value),
                    sx: { flex: 1 },
                    value: webhookKey,
                    InputProps: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label="toggle password visibility"
                            onClick={handleClickShowPassword}
                            onMouseDown={handleMouseDownPassword}
                          >
                            {showWebhookKey ? (
                              <Visibility />
                            ) : (
                              <VisibilityOff />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  },
                },
              ],
            },
          ],
        },
      ]}
    >
      {/* TODO make loading button */}
      <Button
        onClick={onSubmit}
        variant="contained"
        disabled={requestInProgress}
        sx={{
          alignSelf: {
            xs: "start",
            sm: "end",
          },
        }}
      >
        Save
      </Button>
    </Fields>
  );
}

function EmailChannelConfig() {
  return (
    <>
      <SectionSubHeader
        id={settingsSectionIds.emailChannel}
        title="Email"
        description="In order to use email, at least 1 email provider must be configured."
      />
      <SendGridConfig />
    </>
  );
}

function TwilioConfig() {
  const { smsProviders, upsertSmsProvider, apiBase, workspace } =
    useAppStorePick([
      "apiBase",
      "workspace",
      "smsProviders",
      "upsertSmsProvider",
    ]);
  const upsertSmsProviderRequest = useSettingsStore(
    (store) => store.upsertSmsProviderRequest
  );
  const updateSmsProviderRequest = useSettingsStore(
    (store) => store.updateSmsProviderRequest
  );

  const twilioProvider: TwilioSmsProvider | null = useMemo(() => {
    for (const provider of smsProviders) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (provider.type === SmsProviderType.Twilio) {
        return provider;
      }
    }
    return null;
  }, [smsProviders]);

  const [showAuthToken, setShowAuthKey] = useState(false);
  const [authToken, setAuthToken] = useState(twilioProvider?.authToken ?? "");
  const [messagingServiceSid, setMessagingServiceSid] = useState(
    twilioProvider?.messagingServiceSid
  );
  const [accountSid, setAccountSid] = useState(
    twilioProvider?.accountSid ?? ""
  );
  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  const body: UpsertSmsProviderRequest = {
    workspaceId: workspace.value.id,
    setDefault: true,
    smsProvider: {
      type: SmsProviderType.Twilio,
      accountSid,
      authToken,
      messagingServiceSid,
    },
  };

  const apiHandler = apiRequestHandlerFactory({
    request: upsertSmsProviderRequest,
    setRequest: updateSmsProviderRequest,
    responseSchema: SmsProviderConfig,
    setResponse: upsertSmsProvider,
    onSuccessNotice: "Updated Twilio configuration.",
    onFailureNoticeHandler: () =>
      `API Error: Failed to update Twilio configuration.`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/settings/sms-providers`,
      data: body,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  return (
    <Fields
      sections={[
        {
          id: "twilio-section",
          fieldGroups: [
            {
              id: "twilio-fields",
              name: "Twilio",
              fields: [
                {
                  id: "twilio-account-sid",
                  type: "text",
                  fieldProps: {
                    label: "Account sid",
                    helperText: "Twilio account sid.",
                    onChange: (e) => setAccountSid(e.target.value),
                    value: accountSid,
                  },
                },
                {
                  id: "twilio-messaging-service-sid",
                  type: "text",
                  fieldProps: {
                    label: "Messaging service sid",
                    helperText: "Twilio messaging service sid.",
                    onChange: (e) => setMessagingServiceSid(e.target.value),
                    value: messagingServiceSid,
                  },
                },
                {
                  id: "twilio-auth-token",
                  type: "text",
                  fieldProps: {
                    label: "Twilio auth token",
                    helperText:
                      "Twilio auth token used to authenticate requests.",
                    variant: "outlined",
                    type: showAuthToken ? "text" : "password",
                    placeholder: showAuthToken ? undefined : "**********",
                    onChange: (e) => setAuthToken(e.target.value),
                    sx: { flex: 1 },
                    value: authToken,
                    InputProps: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label="toggle password visibility"
                            onClick={() => setShowAuthKey(!showAuthToken)}
                          >
                            {showAuthToken ? <Visibility /> : <VisibilityOff />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  },
                },
              ],
            },
          ],
        },
      ]}
    >
      <Button
        variant="contained"
        sx={{
          alignSelf: {
            xs: "start",
            sm: "end",
          },
        }}
        onClick={apiHandler}
      >
        Save
      </Button>
    </Fields>
  );
}

function SmsChannelConfig() {
  return (
    <>
      <SectionSubHeader
        id={settingsSectionIds.smsChannel}
        title="SMS"
        description="In order to use SMS messaging, at least 1 SMS provider must be configured."
      />
      <TwilioConfig />
    </>
  );
}

function MessageChannelsConfig() {
  return (
    <Stack spacing={3}>
      <SectionHeader title="Message Channels" />
      <EmailChannelConfig />
      <SmsChannelConfig />
    </Stack>
  );
}

function WriteKeySettings() {
  const writeKey = useAppStore((store) => store.writeKeys)[0];
  const keyHeader = useMemo(
    () => (writeKey ? writeKeyToHeader(writeKey) : null),
    [writeKey]
  );

  if (!keyHeader) {
    return null;
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      enqueueSnackbar("Copied write key to clipboard", {
        variant: "success",
        autoHideDuration: 1000,
        anchorOrigin: noticeAnchorOrigin,
      });
    } catch (err) {
      enqueueSnackbar("Failed to write key to clipboard", {
        variant: "error",
        autoHideDuration: 1000,
        anchorOrigin: noticeAnchorOrigin,
      });
    }
  };

  return (
    <Stack spacing={3}>
      <SectionHeader
        id={settingsSectionIds.authentication}
        title="Authentication"
        description=""
      />
      <Fields
        sections={[
          {
            id: "authorization-section-1",
            fieldGroups: [
              {
                id: "authorization-fields",
                name: "Write key",
                fields: [
                  {
                    id: "sendgrid-api-key",
                    type: "text",
                    fieldProps: {
                      label: "",
                      helperText:
                        'Include this key as an HTTP "Authorization: Basic ..." header in your requests. This authorization key can be included in your client, and does not need to be kept secret.',
                      value: keyHeader,
                      children: "abcd",
                      onChange: () => {},
                      InputProps: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              color="primary"
                              onClick={() => copyToClipboard(keyHeader)}
                            >
                              <ContentCopyOutlined />
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    },
                  },
                ],
              },
            ],
          },
        ]}
      />
    </Stack>
  );
}

function HubspotIntegration() {
  const {
    integrations,
    dashboardUrl,
    upsertIntegration,
    apiBase,
    workspace,
    segments: segmentsRequest,
  } = useAppStorePick([
    "integrations",
    "dashboardUrl",
    "upsertIntegration",
    "apiBase",
    "workspace",
    "segments",
  ]);
  const segments =
    segmentsRequest.type === CompletionStatus.Successful
      ? segmentsRequest.value
      : [];
  const [inProgress, setInProgress] = useState<"segments" | "enabled" | null>(
    null
  );

  const { upsertIntegrationsRequest, updateUpsertIntegrationsRequest } =
    useSettingsStorePick([
      "upsertIntegrationsRequest",
      "updateUpsertIntegrationsRequest",
    ]);

  let hubspotIntegration: SyncIntegration | null = null;
  for (const integration of integrations) {
    if (
      integration.name === HUBSPOT_INTEGRATION &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      integration.definition.type === IntegrationType.Sync &&
      integration.enabled
    ) {
      hubspotIntegration = integration.definition;
    }
  }

  const [subscribedSegments, setSubscribedSegments] = useState<
    SegmentResource[]
  >(() => {
    const subbed = new Set(hubspotIntegration?.subscribedSegments ?? []);
    return segments.filter((segment) => subbed.has(segment.name));
  });

  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  let hubspotContents;
  if (hubspotIntegration) {
    const disableBody: UpsertIntegrationResource = {
      workspaceId: workspace.value.id,
      name: HUBSPOT_INTEGRATION,
      enabled: false,
    };
    const handleDisable = apiRequestHandlerFactory({
      request: upsertIntegrationsRequest,
      setRequest: updateUpsertIntegrationsRequest,
      responseSchema: IntegrationResource,
      setResponse: (integration) => {
        setInProgress(null);
        upsertIntegration(integration);
      },
      onSuccessNotice: "Disabled Hubspot integration.",
      onFailureNoticeHandler: () =>
        `API Error: Failed disable Hubspot integration`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/integrations`,
        data: disableBody,
        headers: {
          "Content-Type": "application/json",
        },
      },
    });

    const updateSubscribedSegmentsBody: UpsertIntegrationResource = {
      workspaceId: workspace.value.id,
      name: HUBSPOT_INTEGRATION,
      definition: {
        ...hubspotIntegration,
        subscribedSegments: subscribedSegments.map((segment) => segment.name),
      },
    };
    const saveSyncedSegments = apiRequestHandlerFactory({
      request: upsertIntegrationsRequest,
      setRequest: updateUpsertIntegrationsRequest,
      responseSchema: IntegrationResource,
      setResponse: (integration) => {
        upsertIntegration(integration);
        setInProgress(null);
      },
      onSuccessNotice: "Updated synced hubspot integration segments.",
      onFailureNoticeHandler: () =>
        `API Error: Failed to updated synced hubspot integration segment.`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/integrations`,
        data: updateSubscribedSegmentsBody,
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
    hubspotContents = (
      <Stack spacing={1}>
        <InfoBox>
          Dittofeed can sync segments to Hubspot as lists. See{" "}
          <ExternalLink
            disableNewTab
            enableLinkStyling
            href="https://knowledge.hubspot.com/lists/create-active-or-static-lists"
          >
            the docs
          </ExternalLink>{" "}
          for more information on hubspot lists.
        </InfoBox>

        <Autocomplete
          multiple
          options={segments}
          value={subscribedSegments}
          onChange={(_event, newValue) => {
            setSubscribedSegments(newValue);
          }}
          getOptionLabel={(option) => option.name}
          renderInput={(params) => (
            <TextField {...params} variant="outlined" label="Synced Segments" />
          )}
        />
        <Box>
          <LoadingButton
            variant="contained"
            onClick={() => {
              setInProgress("segments");
              saveSyncedSegments();
            }}
            loading={inProgress === "segments"}
            disabled={inProgress === "enabled"}
          >
            Save Synced Segments
          </LoadingButton>
        </Box>
        <Box>
          <LoadingButton
            variant="outlined"
            color="error"
            onClick={() => {
              setInProgress("enabled");
              handleDisable();
            }}
            loading={inProgress === "enabled"}
            disabled={inProgress === "segments"}
          >
            Disable Hubspot
          </LoadingButton>
        </Box>
      </Stack>
    );
  } else {
    hubspotContents = (
      <Button
        variant="contained"
        sx={{
          alignSelf: {
            xs: "start",
            sm: "end",
          },
        }}
        href={`https://app.hubspot.com/oauth/authorize?client_id=9128468e-b771-4bab-b301-21b479213975&redirect_uri=${dashboardUrl}/dashboard/oauth2/callback/hubspot&scope=timeline%20sales-email-read%20crm.objects.contacts.read%20crm.objects.contacts.write%20crm.objects.companies.write%20crm.objects.companies.read%20crm.objects.owners.read%20crm.lists.write%20crm.lists.read`}
      >
        Connect Hubspot
      </Button>
    );
  }

  return <>{hubspotContents}</>;
}

function IntegrationSettings() {
  return (
    <Stack spacing={3}>
      <SectionHeader title="Integrations" description="" />
      <SectionSubHeader
        id={settingsSectionIds.hubspotIntegration}
        title="Hubspot"
      />
      <Fields
        sections={[
          {
            id: "hubspot-section",
            fieldGroups: [
              {
                id: "hubspot-fields",
                name: "Hubspot",
                fields: [],
                children: <HubspotIntegration />,
              },
            ],
          },
        ]}
      />
    </Stack>
  );
}

function SubscriptionManagementSettings() {
  const subscriptionGroups = useAppStore((store) => store.subscriptionGroups);
  const [fromSubscriptionChange, setFromSubscriptionChange] =
    useState<boolean>(true);
  const [fromSubscribe, setFromSubscribe] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const workspaceResult = useAppStore((store) => store.workspace);
  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;

  const subscriptions = subscriptionGroups.map((sg, i) => ({
    name: sg.name,
    id: sg.id,
    isSubscribed: !(i === 0 && fromSubscriptionChange && !fromSubscribe),
  }));

  if (!workspace) {
    return null;
  }
  const changedSubscription = fromSubscriptionChange
    ? subscriptions[0]?.id
    : undefined;

  return (
    <Stack>
      <Dialog open={showPreview} onClose={() => setShowPreview(false)}>
        <Stack sx={{ p: 4 }}>
          <Box>
            <Box>
              Preview of the subscription management page, that will be shown to
              users.
            </Box>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={fromSubscriptionChange}
                    onChange={(e) =>
                      setFromSubscriptionChange(e.target.checked)
                    }
                  />
                }
                label="User clicked subscription change link."
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={fromSubscribe}
                    onChange={(e) => setFromSubscribe(e.target.checked)}
                  />
                }
                label={`${fromSubscribe ? "Subscribe" : "Unsubscribe"} link.`}
              />
            </FormGroup>
          </Box>
          <Paper
            elevation={1}
            sx={{
              p: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SubscriptionManagement
              key={`${fromSubscribe}-${fromSubscriptionChange}`}
              subscriptions={subscriptions}
              workspaceName={workspace.name}
              onSubscriptionUpdate={async () => {}}
              subscriptionChange={
                fromSubscribe
                  ? SubscriptionChange.Subscribe
                  : SubscriptionChange.Unsubscribe
              }
              changedSubscription={changedSubscription}
              workspaceId={workspace.id}
              hash="example-hash"
              identifier="example@email.com"
              identifierKey="email"
            />
          </Paper>
        </Stack>
      </Dialog>
      <Stack spacing={3}>
        <SectionHeader
          id={settingsSectionIds.subscription}
          title="Subscription Management"
          description=""
        />
        <Fields
          sections={[
            {
              id: "subscription-section-1",
              fieldGroups: [
                {
                  id: "subscription-preview",
                  name: "User subscription page",
                  fields: [
                    {
                      id: "subscription-preview-button",
                      type: "button",
                      fieldProps: {
                        children: "Preview",
                        onClick: () => {
                          setShowPreview(true);
                        },
                        variant: "outlined",
                      },
                    },
                  ],
                },
              ],
            },
          ]}
        />
      </Stack>
    </Stack>
  );
}

const Settings: NextPage<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = function Settings() {
  return (
    <SettingsLayout>
      <Stack
        spacing={8}
        sx={{
          padding: 2,
          paddingY: 8,
          maxWidth: "lg",
          marginX: "auto",
          width: "100%",
        }}
      >
        <SegmentIoConfig />
        <MessageChannelsConfig />
        <WriteKeySettings />
        <SubscriptionManagementSettings />
        <IntegrationSettings />
      </Stack>
    </SettingsLayout>
  );
};
export default Settings;
