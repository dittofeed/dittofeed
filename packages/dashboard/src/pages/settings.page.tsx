/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  Create,
  InfoOutlined,
  Key,
  Mail,
  SimCardDownload,
  SmsOutlined,
  Webhook,
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
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { getAdminApiKeys } from "backend-lib/src/adminApiKeys";
import { getOrCreateWriteKey, getWriteKeys } from "backend-lib/src/auth";
import { HUBSPOT_INTEGRATION } from "backend-lib/src/constants";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { findAllEnrichedIntegrations } from "backend-lib/src/integrations";
import { getOrCreateSmsProviders } from "backend-lib/src/messaging/sms";
import { getSecretAvailability } from "backend-lib/src/secrets";
import { toSegmentResource } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { and, eq } from "drizzle-orm";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import {
  EMAIL_PROVIDER_TYPE_TO_SECRET_NAME,
  SecretNames,
  SMS_PROVIDER_TYPE_TO_SECRET_NAME,
} from "isomorphic-lib/src/constants";
import { emailProviderLabel } from "isomorphic-lib/src/email";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CompletionStatus,
  DataSourceVariantType,
  DefaultEmailProviderResource,
  DefaultSmsProviderResource,
  EmailProviderType,
  EmptyResponse,
  EphemeralRequestStatus,
  IntegrationResource,
  IntegrationType,
  PartialSegmentResource,
  SmsProviderType,
  SmtpSecretKey,
  SubscriptionChange,
  SyncIntegration,
  UpsertIntegrationResource,
} from "isomorphic-lib/src/types";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";
import { enqueueSnackbar } from "notistack";
import { useEffect, useMemo, useState } from "react";
import { pick } from "remeda";
import { useImmer } from "use-immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import AdminApiKeyTable from "../components/adminApiKeyTable";
import DashboardHead from "../components/dashboardHead";
import ExternalLink from "../components/externalLink";
import Fields from "../components/form/Fields";
import {
  FieldComponents,
  SecretField,
  TextField as TextFieldComponent,
} from "../components/form/types";
import { HubspotIcon } from "../components/icons/hubspotIcon";
import InfoBox from "../components/infoBox";
import Layout from "../components/layout";
import { MenuItemGroup } from "../components/menuItems/types";
import { PermissionsTable } from "../components/permissionsTable";
import { SubscriptionManagement } from "../components/subscriptionManagement";
import WebhookSecretTable from "../components/webhookSecretTable";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStore, useAppStorePick } from "../lib/appStore";
import { copyInputProps } from "../lib/copyToClipboard";
import { getOrCreateEmailProviders } from "../lib/email";
import { noticeAnchorOrigin } from "../lib/notices";
import { requestContext } from "../lib/requestContext";
import { AppState, PreloadedState, PropsWithInitialState } from "../lib/types";

function useSecretAvailability(): AppState["secretAvailability"] | undefined {
  const { secretAvailability, inTransition } = useAppStorePick([
    "secretAvailability",
    "inTransition",
  ]);
  if (inTransition) {
    return undefined;
  }
  return secretAvailability;
}

function isSecretSaved(
  name: SecretNames,
  key: string,
  secretAvailability?: AppState["secretAvailability"],
): boolean | undefined {
  if (!secretAvailability) {
    return undefined;
  }
  return (
    secretAvailability.find((s) => s.name === name)?.configValue?.[key] ?? false
  );
}

function copyToClipboardField({
  value,
  helperText,
  successNotice,
  failureNotice,
  id,
}: {
  id: string;
  value: string;
  helperText?: string;
  successNotice: string;
  failureNotice: string;
}): TextFieldComponent {
  return {
    id,
    type: "text",
    fieldProps: {
      label: "",
      helperText,
      value,
      onChange: () => {},
      InputProps: copyInputProps({
        value,
        successNotice,
        failureNotice,
      }),
    },
  };
}

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
      defaultSmsProviderRecord,
      secretAvailability,
      adminApiKeys,
    ] = await Promise.all([
      getOrCreateEmailProviders({ workspaceId }),
      db().query.defaultEmailProvider.findFirst({
        where: eq(schema.defaultEmailProvider.workspaceId, workspaceId),
      }),
      db().query.subscriptionGroup.findMany({
        where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
      }),
      getWriteKeys({ workspaceId }).then((keys) => keys[0]),
      findAllEnrichedIntegrations(workspaceId),
      db()
        .query.segment.findMany({
          where: and(
            eq(schema.segment.workspaceId, workspaceId),
            eq(schema.segment.resourceType, "Declarative"),
          ),
        })
        .then((dbSegments) =>
          dbSegments.map((segment) => unwrap(toSegmentResource(segment))),
        ),
      getOrCreateSmsProviders({ workspaceId }),
      db().query.defaultSmsProvider.findFirst({
        where: eq(schema.defaultSmsProvider.workspaceId, workspaceId),
      }),
      getSecretAvailability({
        workspaceId,
        names: [
          SecretNames.Webhook,
          ...Object.values(EMAIL_PROVIDER_TYPE_TO_SECRET_NAME),
          ...Object.values(SMS_PROVIDER_TYPE_TO_SECRET_NAME),
        ],
      }),
      getAdminApiKeys({ workspaceId }),
    ]);

    const serverInitialState: PreloadedState = {
      emailProviders,
      secretAvailability,
      defaultEmailProvider: defaultEmailProviderRecord,
      integrations: unwrap(integrations).map((i) =>
        pick(i, ["id", "name", "workspaceId", "definition", "enabled"]),
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
        await getOrCreateWriteKey({
          workspaceId,
          writeKeyName: "default-write-key",
        }),
      ];
    }

    const subscriptionGroupResources = subscriptionGroups.map(
      subscriptionGroupToResource,
    );

    serverInitialState.subscriptionGroups = subscriptionGroupResources;
    serverInitialState.defaultSmsProvider = defaultSmsProviderRecord;
    serverInitialState.smsProviders = smsProviders;
    serverInitialState.adminApiKeys = adminApiKeys;

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
  webhookChannel: "webhook-channel",
  subscription: "subscriptions",
  authentication: "authentication",
  writeKey: "write-key",
  adminApiKey: "admin-api-key",
  hubspotIntegration: "hubspot-integration",
  workspaceMetadata: "workspace-metadata",
  permissions: "permissions",
} as const;

function getMenuItems(authMode: string | undefined): MenuItemGroup[] {
  const baseMenuItems: MenuItemGroup[] = [
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
        {
          id: "webhook",
          title: "Webhook",
          type: "item",
          url: `/settings#${settingsSectionIds.webhookChannel}`,
          icon: Webhook,
          description: "Configure webhook settings, including custom secrets.",
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
      children: [
        {
          id: "write-key",
          title: "Public Write Key",
          type: "item",
          url: `/settings#${settingsSectionIds.writeKey}`,
          description: "Write key used to submit user data to Dittofeed.",
          icon: Create,
        },
        {
          id: "admin-api-key",
          title: "Admin API Key",
          type: "item",
          url: `/settings#${settingsSectionIds.adminApiKey}`,
          description: "API key used to authenticate against the Admin API.",
          icon: Key,
        },
      ],
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
    {
      id: settingsSectionIds.workspaceMetadata,
      title: "Workspace Metadata",
      type: "group",
      children: [
        {
          id: "workspace-id",
          title: "Workspace Id",
          type: "item",
          url: `/settings#${settingsSectionIds.workspaceMetadata}`,
          icon: InfoOutlined,
          description: "Copy workspace id to clipboard.",
        },
      ],
      url: `/settings#${settingsSectionIds.workspaceMetadata}`,
    },
  ];

  // Only add permissions menu item in multi-tenant mode
  if (authMode === "multi-tenant") {
    baseMenuItems.push({
      id: settingsSectionIds.permissions,
      title: "Permissions",
      type: "group",
      children: [
        {
          id: "workspace-permissions",
          title: "Workspace Permissions",
          type: "item",
          url: `/settings#${settingsSectionIds.permissions}`,
          icon: Key,
          description: "Manage workspace member roles and permissions.",
        },
      ],
      url: `/settings#${settingsSectionIds.permissions}`,
    });
  }

  return baseMenuItems;
}

function SettingsLayout(
  props: Omit<React.ComponentProps<typeof Layout>, "items">,
) {
  const { authMode } = useAppStorePick(["authMode"]);
  const menuItems = getMenuItems(authMode);

  console.log("authMode", authMode);
  return (
    <>
      <DashboardHead />
      <Layout
        pageTitle="Settings"
        backLink="/"
        navigationRenderer="minimal"
        items={menuItems}
        {...props}
      />
    </>
  );
}

interface SettingsState {
  upsertSmsProviderRequest: EphemeralRequestStatus<Error>;
  upsertIntegrationsRequest: EphemeralRequestStatus<Error>;
}

interface SettingsActions {
  updateUpsertIntegrationsRequest: (
    request: EphemeralRequestStatus<Error>,
  ) => void;
  updateSmsProviderRequest: (request: EphemeralRequestStatus<Error>) => void;
}

type SettingsContent = SettingsState & SettingsActions;

export const useSettingsStore = create(
  immer<SettingsActions & SettingsState>((set) => ({
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
    updateSmsProviderRequest: (request) => {
      set((state) => {
        state.upsertSmsProviderRequest = request;
      });
    },
  })),
);

function useSettingsStorePick(params: (keyof SettingsContent)[]) {
  return useSettingsStore((store) => pick(store, params));
}

function SegmentIoConfig() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [sharedSecret, setSharedSecret] = useState("");
  const [secretExists, setSecretExists] = useState(false);
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);
  const queryClient = useQueryClient();

  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  // Fetch existing segment configuration
  const segmentConfigQuery = useQuery({
    queryKey: ["segmentConfig", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const response = await axios.get(
        `${apiBase}/api/settings/data-sources?workspaceId=${workspaceId}`,
      );

      return response.data;
    },
    enabled: !!workspaceId,
  });

  // Update isEnabled when the query data changes
  useEffect(() => {
    if (segmentConfigQuery.data) {
      const segmentEnabled =
        segmentConfigQuery.data.dataSourceConfigurations?.includes(
          DataSourceVariantType.SegmentIO,
        );
      setIsEnabled(!!segmentEnabled);
      setSecretExists(!!segmentEnabled);
    }
  }, [segmentConfigQuery.data]);

  // Mutation to update segment configuration
  const segmentConfigMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) return null;

      // Determine what shared secret value to send
      let sharedSecretValue: string | undefined;

      // If there's no new value entered and a secret already exists,
      // send undefined to keep existing value
      if (!sharedSecret && secretExists) {
        sharedSecretValue = undefined;
      } else {
        // Otherwise send the new value
        sharedSecretValue = sharedSecret;
      }

      const body = {
        workspaceId,
        variant: {
          type: DataSourceVariantType.SegmentIO,
          sharedSecret: sharedSecretValue,
        },
      };

      return axios.put(`${apiBase}/api/settings/data-sources`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["segmentConfig", workspaceId],
      });
      enqueueSnackbar("Segment configuration updated successfully", {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    },
    onError: (error) => {
      enqueueSnackbar(
        `Failed to update Segment configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
        {
          variant: "error",
          autoHideDuration: 10000,
          anchorOrigin: noticeAnchorOrigin,
        },
      );
    },
  });

  // Mutation to delete segment configuration
  const deleteSegmentConfigMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) return null;

      return axios.delete(
        `${apiBase}/api/settings/data-sources?workspaceId=${workspaceId}&type=${DataSourceVariantType.SegmentIO}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["segmentConfig", workspaceId],
      });
      enqueueSnackbar("Segment integration disabled successfully", {
        variant: "success",
        autoHideDuration: 3000,
        anchorOrigin: noticeAnchorOrigin,
      });
    },
    onError: (error) => {
      enqueueSnackbar(
        `Failed to disable Segment integration: ${error instanceof Error ? error.message : "Unknown error"}`,
        {
          variant: "error",
          autoHideDuration: 10000,
          anchorOrigin: noticeAnchorOrigin,
        },
      );
    },
  });

  const handleSubmit = () => {
    if (isEnabled) {
      segmentConfigMutation.mutate();
    } else {
      deleteSegmentConfigMutation.mutate();
    }
  };

  const isPending =
    segmentConfigMutation.isPending || deleteSegmentConfigMutation.isPending;

  const saveButtonDisabled =
    isPending || (isEnabled && !secretExists && !sharedSecret);

  return (
    <Stack spacing={3}>
      <SectionHeader
        id={settingsSectionIds.segmentSource}
        title="Data Sources"
        description="Integrations for submitting data to your workspace."
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
                        checked: isEnabled,
                        disabled: segmentConfigQuery.isPending,
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
                            placeholder: secretExists ? "••••••••••" : "",
                            helperText:
                              secretExists && !sharedSecret
                                ? "Secret is already configured. Enter a new value to change it."
                                : "Secret for validating signed request bodies from segment.",
                            onChange: (e) => {
                              setSharedSecret(e.target.value);
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
          disabled={saveButtonDisabled}
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
  const secretAvailability = useSecretAvailability();

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
                  id: "sendgrid-api-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.SendGrid,
                    secretKey: "apiKey",
                    label: "Sendgrid API Key",
                    helperText:
                      "API key, used internally to send emails via sendgrid.",
                    type: EmailProviderType.SendGrid,
                    saved: isSecretSaved(
                      SecretNames.SendGrid,
                      "apiKey",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "sendgrid-webhook-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.SendGrid,
                    secretKey: "webhookKey",
                    label: "Webhook Key",
                    helperText:
                      "Sendgrid webhook verification key, used to authenticate sendgrid webhook requests.",
                    type: EmailProviderType.SendGrid,
                    saved: isSecretSaved(
                      SecretNames.SendGrid,
                      "webhookKey",
                      secretAvailability,
                    ),
                  },
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}

function AmazonSesConfig() {
  const secretAvailability = useSecretAvailability();

  return (
    <Fields
      sections={[
        {
          id: "amazonses-section",
          fieldGroups: [
            {
              id: "amazonses-fields",
              name: "AmazonSES",
              fields: [
                {
                  id: "amazonses-access-key-id",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.AmazonSes,
                    secretKey: "accessKeyId",
                    label: "Access Key Id",
                    helperText: "IAM user access key",
                    type: EmailProviderType.AmazonSes,
                    saved: isSecretSaved(
                      SecretNames.AmazonSes,
                      "accessKeyId",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "amazonses-secret-access-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.AmazonSes,
                    secretKey: "secretAccessKey",
                    label: "Secret Access Key",
                    helperText: "Secret access key for IAM user.",
                    type: EmailProviderType.AmazonSes,
                    saved: isSecretSaved(
                      SecretNames.AmazonSes,
                      "secretAccessKey",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "amazonses-region",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.AmazonSes,
                    secretKey: "region",
                    label: "AWS Region",
                    helperText: "The AWS region to route requests to.",
                    type: EmailProviderType.AmazonSes,
                    saved: isSecretSaved(
                      SecretNames.AmazonSes,
                      "region",
                      secretAvailability,
                    ),
                  },
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}

function MailChimpConfig() {
  const secretAvailability = useSecretAvailability();

  return (
    <Fields
      sections={[
        {
          id: "mailchimp-section",
          fieldGroups: [
            {
              id: "mailchimp-fields",
              name: "MailChimp",
              fields: [
                {
                  id: "mailchimp-api-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.MailChimp,
                    secretKey: "apiKey",
                    label: "MailChimp API Key",
                    helperText: "API key used to send emails via MailChimp.",
                    type: EmailProviderType.MailChimp,
                    saved: isSecretSaved(
                      SecretNames.MailChimp,
                      "apiKey",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "mailchimp-webhook-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.MailChimp,
                    secretKey: "webhookKey",
                    label: "Webhook Key",
                    helperText:
                      "MailChimp webhook verification key, used to authenticate webhook requests.",
                    type: EmailProviderType.MailChimp,
                    saved: isSecretSaved(
                      SecretNames.MailChimp,
                      "webhookKey",
                      secretAvailability,
                    ),
                  },
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}

function ResendConfig() {
  const secretAvailability = useSecretAvailability();

  return (
    <Fields
      sections={[
        {
          id: "resend-section",
          fieldGroups: [
            {
              id: "resend-fields",
              name: "Resend",
              fields: [
                {
                  id: "resend-api-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Resend,
                    secretKey: "apiKey",
                    label: "Resend API Key",
                    helperText:
                      "API key, used internally to send emails via resend.",
                    type: EmailProviderType.Resend,
                    saved: isSecretSaved(
                      SecretNames.Resend,
                      "apiKey",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "resend-webhook-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Resend,
                    secretKey: "webhookKey",
                    label: "Webhook Key",
                    helperText:
                      "Resend webhook verification key, used to authenticate resend webhook requests.",
                    type: EmailProviderType.Resend,
                    saved: isSecretSaved(
                      SecretNames.Resend,
                      "webhookKey",
                      secretAvailability,
                    ),
                  },
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}

function PostMarkConfig() {
  const secretAvailability = useSecretAvailability();

  return (
    <Fields
      sections={[
        {
          id: "postmark-section",
          fieldGroups: [
            {
              id: "postmark-fields",
              name: "PostMark",
              fields: [
                {
                  id: "postmark-api-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Postmark,
                    secretKey: "apiKey",
                    label: "API Key",
                    helperText:
                      "API key, used internally to send emails via Postmark.",
                    type: EmailProviderType.PostMark,
                    saved: isSecretSaved(
                      SecretNames.Postmark,
                      "apiKey",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "postmark-webhook-key",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Postmark,
                    secretKey: "webhookKey",
                    label: "Webhook Key",
                    helperText:
                      "Auth header value (x-postmark-secret), used to authenticate PostMark webhook requests. Use a secure random string generator.",
                    type: EmailProviderType.PostMark,
                    saved: isSecretSaved(
                      SecretNames.Postmark,
                      "webhookKey",
                      secretAvailability,
                    ),
                  },
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}

const SMTP_SECRET_FIELDS: {
  helperText: string;
  label: string;
  key: SmtpSecretKey;
}[] = [
  {
    key: "host",
    label: "SMTP host",
    helperText: "Host of SMTP server.",
  },
  {
    key: "port",
    label: "SMTP port",
    helperText: "Port of SMTP server.",
  },
  {
    key: "username",
    label: "SMTP Username",
    helperText: "Username used to authenticate SMTP server.",
  },
  {
    key: "password",
    label: "SMTP Password",
    helperText: "Password used to authenticate SMTP server.",
  },
];

function SmtpConfig() {
  const secretAvailability = useSecretAvailability();
  const fields: SecretField[] = SMTP_SECRET_FIELDS.map((field) => ({
    id: `smtp-${field.key}`,
    type: "secret",
    fieldProps: {
      name: SecretNames.Smtp,
      secretKey: field.key,
      label: field.label,
      helperText: field.helperText,
      type: EmailProviderType.Smtp,
      saved: isSecretSaved(SecretNames.Smtp, field.key, secretAvailability),
    },
  }));

  return (
    <Fields
      sections={[
        {
          id: "smtp-section",
          fieldGroups: [
            {
              id: "smtp-fields",
              name: "SMTP",
              description: "Send emails with a custom SMTP server.",
              fields,
            },
          ],
        },
      ]}
    />
  );
}

function DefaultEmailConfig() {
  const {
    emailProviders,
    apiBase,
    workspace,
    defaultEmailProvider,
    setDefaultEmailProvider,
  } = useAppStorePick([
    "apiBase",
    "workspace",
    "emailProviders",
    "defaultEmailProvider",
    "setDefaultEmailProvider",
  ]);
  const [
    { defaultProvider, defaultFromAddress, defaultProviderRequest },
    setState,
  ] = useImmer<{
    defaultProvider: string | null;
    defaultFromAddress: string | null;
    defaultProviderRequest: EphemeralRequestStatus<Error>;
  }>({
    defaultProvider: defaultEmailProvider?.emailProviderId ?? null,
    defaultFromAddress: defaultEmailProvider?.fromAddress ?? null,
    defaultProviderRequest: {
      type: CompletionStatus.NotStarted,
    },
  });

  const apiHandler = (emailProviderId: string, fromAddress: string) => {
    if (workspace.type !== CompletionStatus.Successful) {
      return;
    }
    apiRequestHandlerFactory({
      request: defaultProviderRequest,
      setRequest: (request) => {
        setState((state) => {
          state.defaultProviderRequest = request;
        });
      },
      responseSchema: EmptyResponse,
      onSuccessNotice: "Set default email configuration.",
      onFailureNoticeHandler: () =>
        `API Error: Failed to set default email configuration.`,
      setResponse: () => {
        if (!defaultProvider) {
          return;
        }
        setDefaultEmailProvider({
          workspaceId: workspace.value.id,
          emailProviderId: defaultProvider,
          fromAddress,
        });
      },
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/settings/email-providers/default`,
        data: {
          workspaceId: workspace.value.id,
          emailProviderId,
          fromAddress,
        } satisfies DefaultEmailProviderResource,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  };

  const options = emailProviders.map((ep) => {
    const { type } = ep;
    return {
      value: ep.id,
      label: emailProviderLabel(type),
    };
  });

  return (
    <Fields
      sections={[
        {
          id: "default-email-section",
          fieldGroups: [
            {
              id: "default-email-fields",
              name: "Default Email Configuration",
              fields: [
                {
                  id: "default-email-provider",
                  type: "select",
                  fieldProps: {
                    label: "Default Email Provider",
                    value: defaultProvider ?? "",
                    onChange: (value) => {
                      setState((state) => {
                        state.defaultProvider = value;
                      });
                    },
                    options,
                    helperText:
                      "In order to use email, at least 1 email provider must be configured.",
                  },
                },
                {
                  id: "default-from-address",
                  type: "text",
                  fieldProps: {
                    label: 'Default "From" Address',
                    value: defaultFromAddress ?? "",
                    onChange: ({ target: { value } }) => {
                      setState((state) => {
                        state.defaultFromAddress = value;
                      });
                    },
                    helperText:
                      'This will be used to populate "From" address in email templates.',
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
        disabled={!defaultProvider}
        sx={{
          alignSelf: {
            xs: "start",
            sm: "end",
          },
        }}
        onClick={() =>
          apiHandler(defaultProvider ?? "", defaultFromAddress ?? "")
        }
      >
        Save
      </Button>
    </Fields>
  );
}

function EmailChannelConfig() {
  return (
    <>
      <SectionSubHeader id={settingsSectionIds.emailChannel} title="Email" />
      <DefaultEmailConfig />
      <SendGridConfig />
      <AmazonSesConfig />
      <ResendConfig />
      <PostMarkConfig />
      <MailChimpConfig />
      <SmtpConfig />
    </>
  );
}

function DefaultSmsConfig() {
  const {
    smsProviders,
    apiBase,
    workspace,
    defaultSmsProvider,
    setDefaultSmsProvider,
  } = useAppStorePick([
    "apiBase",
    "workspace",
    "smsProviders",
    "defaultSmsProvider",
    "setDefaultSmsProvider",
  ]);
  const [{ defaultProvider, defaultProviderRequest }, setState] = useImmer<{
    defaultProvider: string | null;
    defaultProviderRequest: EphemeralRequestStatus<Error>;
  }>({
    defaultProvider: defaultSmsProvider?.smsProviderId ?? null,
    defaultProviderRequest: {
      type: CompletionStatus.NotStarted,
    },
  });

  const apiHandler = (smsProviderId: string) => {
    if (workspace.type !== CompletionStatus.Successful) {
      return;
    }
    apiRequestHandlerFactory({
      request: defaultProviderRequest,
      setRequest: (request) => {
        setState((state) => {
          state.defaultProviderRequest = request;
        });
      },
      responseSchema: EmptyResponse,
      onSuccessNotice: "Set default SMS configuration.",
      onFailureNoticeHandler: () =>
        `API Error: Failed to set default SMS configuration.`,
      setResponse: () => {
        if (!defaultProvider) {
          return;
        }
        setDefaultSmsProvider({
          workspaceId: workspace.value.id,
          smsProviderId: defaultProvider,
        });
      },
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/settings/sms-providers/default`,
        data: {
          workspaceId: workspace.value.id,
          smsProviderId,
        } satisfies DefaultSmsProviderResource,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  };

  const options = smsProviders.map((ep) => {
    let name: string;
    const { type } = ep;
    switch (type) {
      case SmsProviderType.Twilio:
        name = "Twilio";
        break;
      case SmsProviderType.Test:
        name = "Test";
        break;
      default:
        assertUnreachable(type as never, `Unknown email provider type ${type}`);
    }
    return {
      value: ep.id,
      label: name,
    };
  });

  return (
    <Fields
      sections={[
        {
          id: "default-sms-section",
          fieldGroups: [
            {
              id: "default-sms-fields",
              name: "Default SMS Configuration",
              fields: [
                {
                  id: "default-sms-provider",
                  type: "select",
                  fieldProps: {
                    label: "Default SMS Provider",
                    value: defaultProvider ?? "",
                    onChange: (value) => {
                      setState((state) => {
                        state.defaultProvider = value;
                      });
                    },
                    options,
                    helperText:
                      "In order to use SMS, at least 1 SMS provider must be configured.",
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
        disabled={!defaultProvider}
        sx={{
          alignSelf: {
            xs: "start",
            sm: "end",
          },
        }}
        onClick={() => apiHandler(defaultProvider ?? "")}
      >
        Save
      </Button>
    </Fields>
  );
}

function Twilios() {
  const secretAvailability = useSecretAvailability();
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
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Twilio,
                    secretKey: "accountSid",
                    label: "Account SID",
                    helperText: "Twilio Account SID",
                    type: SmsProviderType.Twilio,
                    saved: isSecretSaved(
                      SecretNames.Twilio,
                      "accountSid",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "twilio-messaging-service-sid",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Twilio,
                    secretKey: "messagingServiceSid",
                    label: "Messaging Service SID",
                    helperText: "Twilio messaging service SID",
                    type: SmsProviderType.Twilio,
                    saved: isSecretSaved(
                      SecretNames.Twilio,
                      "messagingServiceSid",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "twilio-auth-token",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Twilio,
                    secretKey: "authToken",
                    label: "Twilio Auth Token",
                    helperText:
                      "Twilio auth token used to authenticate requests.",
                    type: SmsProviderType.Twilio,
                    saved: isSecretSaved(
                      SecretNames.Twilio,
                      "authToken",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "twilio-api-key-sid",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Twilio,
                    secretKey: "apiKeySid",
                    label: "Twilio API Key SID",
                    helperText:
                      "Twilio API Key SID used to authenticate requests. Used with the API key secret to authenticate requests as an alternative to the auth token.",
                    type: SmsProviderType.Twilio,
                    saved: isSecretSaved(
                      SecretNames.Twilio,
                      "apiKeySid",
                      secretAvailability,
                    ),
                  },
                },
                {
                  id: "twilio-api-key-secret",
                  type: "secret",
                  fieldProps: {
                    name: SecretNames.Twilio,
                    secretKey: "apiKeySecret",
                    label: "Twilio API Key Secret",
                    helperText:
                      "Twilio API Key Secret used to authenticate requests. Used with the API key SID to authenticate requests as an alternative to the auth token.",
                    type: SmsProviderType.Twilio,
                    saved: isSecretSaved(
                      SecretNames.Twilio,
                      "apiKeySecret",
                      secretAvailability,
                    ),
                  },
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}

function SmsChannelConfig() {
  return (
    <>
      <SectionSubHeader id={settingsSectionIds.smsChannel} title="SMS" />
      <DefaultSmsConfig />
      <Twilios />
    </>
  );
}

function WebhookChannelConfig() {
  return (
    <>
      <SectionSubHeader
        id={settingsSectionIds.webhookChannel}
        title="Webhook"
      />
      <Fields disableChildStyling sections={[]}>
        <WebhookSecretTable />
      </Fields>
    </>
  );
}

function MessageChannelsConfig() {
  return (
    <Stack spacing={3}>
      <SectionHeader title="Message Channels" />
      <EmailChannelConfig />
      <SmsChannelConfig />
      <WebhookChannelConfig />
    </Stack>
  );
}

function WriteKeySettings() {
  const writeKey = useAppStore((store) => store.writeKeys)[0];
  const keyHeader = useMemo(
    () => (writeKey ? writeKeyToHeader(writeKey) : null),
    [writeKey],
  );

  if (!keyHeader) {
    return null;
  }

  return (
    <Fields
      sections={[
        {
          id: settingsSectionIds.writeKey,
          fieldGroups: [
            {
              id: "write-key-fields",
              name: "Write key",
              fields: [
                copyToClipboardField({
                  id: "sendgrid-api-key",
                  successNotice: "Copied write key to clipboard.",
                  failureNotice: "Failed to copy write key to clipboard.",
                  value: keyHeader,
                  helperText:
                    'Include this key as an HTTP "Authorization: Basic ..." header in your requests. This authorization key can be included in your client, and does not need to be kept secret.',
                }),
              ],
            },
          ],
        },
      ]}
    />
  );
}

function AdminApiKeySettings() {
  return (
    <Fields
      disableChildStyling
      sections={[
        {
          id: settingsSectionIds.adminApiKey,
          fieldGroups: [
            {
              id: "authorization-fields",
              name: "Admin API Key",
              fields: [],
            },
          ],
        },
      ]}
    >
      <AdminApiKeyTable />
    </Fields>
  );
}

function AuthenticationSettings() {
  return (
    <Stack spacing={3}>
      <SectionHeader
        id={settingsSectionIds.authentication}
        title="Authentication"
        description=""
      />
      <WriteKeySettings />
      <AdminApiKeySettings />
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
    null,
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
    PartialSegmentResource[]
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
          Segments can be synced to Hubspot as lists. See{" "}
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
      <Fields
        sections={[
          {
            id: settingsSectionIds.hubspotIntegration,
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
  const { apiBase } = useAppStorePick(["apiBase"]);
  const [fromSubscriptionChange, setFromSubscriptionChange] =
    useState<boolean>(true);
  const [fromSubscribe, setFromSubscribe] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const workspaceResult = useAppStore((store) => store.workspace);
  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;

  // For unsubscribe simulation, unsubscribe all groups in the same channel as the first group
  const firstSubscriptionGroup = subscriptionGroups[0];
  const channelToUnsubscribeFrom = firstSubscriptionGroup?.channel;

  const subscriptions = subscriptionGroups.map((sg) => ({
    name: sg.name,
    id: sg.id,
    isSubscribed: !(
      fromSubscriptionChange &&
      !fromSubscribe &&
      sg.channel === channelToUnsubscribeFrom
    ),
    channel: sg.channel,
  }));

  if (!workspace) {
    return null;
  }

  const changedSubscription = fromSubscriptionChange
    ? subscriptions[0]?.id
    : undefined;

  const changedSubscriptionChannel =
    fromSubscriptionChange && !fromSubscribe
      ? channelToUnsubscribeFrom
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
              subscriptionChange={
                fromSubscribe
                  ? SubscriptionChange.Subscribe
                  : SubscriptionChange.Unsubscribe
              }
              changedSubscription={changedSubscription}
              changedSubscriptionChannel={changedSubscriptionChannel}
              workspaceId={workspace.id}
              hash="example-hash"
              identifier="example@email.com"
              identifierKey="email"
              apiBase={apiBase}
              isPreview
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

function Metadata() {
  const { workspace: workspaceResult } = useAppStorePick(["workspace"]);
  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;
  if (!workspace) {
    return null;
  }
  return (
    <Stack spacing={3}>
      <SectionHeader
        title="Workspace Metadata"
        description=""
        id={settingsSectionIds.workspaceMetadata}
      />
      <Fields
        sections={[
          {
            id: "workspace-metadata-section",
            fieldGroups: [
              {
                id: "workspace-metadata-fields",
                name: "Workspace Id",
                fields: [
                  copyToClipboardField({
                    id: "workspace-id",
                    successNotice: "Copied workspace id to clipboard.",
                    failureNotice: "Failed to copy workspace id to clipboard.",
                    value: workspace.id,
                    helperText: `Id of the current "${workspace.name}" workspace.`,
                  }),
                ],
              },
            ],
          },
        ]}
      />
    </Stack>
  );
}

function PermissionsSettings() {
  const { authMode } = useAppStorePick(["authMode"]);

  // Only render in multi-tenant mode
  if (authMode !== "multi-tenant") {
    return null;
  }

  return (
    <Stack spacing={3}>
      <SectionHeader
        id={settingsSectionIds.permissions}
        title="Permissions"
        description="Manage workspace member roles and permissions."
      />
      <PermissionsTable />
    </Stack>
  );
}

function SettingsContents() {
  const { inTransition } = useAppStorePick(["inTransition"]);
  if (inTransition) {
    return null;
  }
  return (
    <>
      <SegmentIoConfig />
      <MessageChannelsConfig />
      <AuthenticationSettings />
      <SubscriptionManagementSettings />
      <IntegrationSettings />
      <PermissionsSettings />
      <Metadata />
    </>
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
        <SettingsContents />
      </Stack>
    </SettingsLayout>
  );
};
export default Settings;
