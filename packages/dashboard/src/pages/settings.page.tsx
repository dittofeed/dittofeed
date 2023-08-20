import {
  ArrowBackIos,
  ContentCopyOutlined,
  East,
  Key,
  MailOutline,
} from "@mui/icons-material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  IconButtonProps,
  Paper,
  Stack,
  styled,
  Switch,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { createWriteKey, getWriteKeys } from "backend-lib/src/auth";
import { generateSecureKey } from "backend-lib/src/crypto";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { SubscriptionChange } from "backend-lib/src/types";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import { SENDGRID_WEBHOOK_SECRET_NAME } from "isomorphic-lib/src/constants";
import {
  CompletionStatus,
  DataSourceConfigurationResource,
  DataSourceVariantType,
  EmailProviderResource,
  EmailProviderType,
  EphemeralRequestStatus,
  PersistedEmailProvider,
  UpsertDataSourceConfigurationResource,
  UpsertEmailProviderResource,
} from "isomorphic-lib/src/types";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";
import { enqueueSnackbar } from "notistack";
import { useMemo, useState } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { Collapaseable } from "../components/collapsable";
import ExternalLink from "../components/externalLink";
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
import SecretEditor from "../lib/secretEditor";
import { PreloadedState, PropsWithInitialState } from "../lib/types";

interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
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
        return { type: providerType, id, apiKey, workspaceId };
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

    serverInitialState.subscriptionGroups = {
      type: CompletionStatus.Successful,
      value: subscriptionGroupResources,
    };

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState,
        props: {},
      }),
    };
  });

const ExpandMore = styled((props: ExpandMoreProps) => {
  const iconProps: Partial<ExpandMoreProps> = { ...props };
  delete iconProps.expand;
  return <IconButton {...iconProps} />;
})(({ theme, expand }) => ({
  transform: !expand ? "rotate(0deg)" : "rotate(180deg)",
  marginLeft: "auto",
  transition: theme.transitions.create("transform", {
    duration: theme.transitions.duration.shortest,
  }),
}));

const menuItems: MenuItemGroup[] = [
  {
    id: "reporting",
    title: "Settings",
    type: "group",
    children: [
      {
        id: "dashboard",
        title: "Return Home",
        type: "item",
        url: "/",
        icon: ArrowBackIos,
        description: "Exit settings, and return to the home page.",
      },
      {
        id: "data-sources",
        title: "Data Sources",
        type: "item",
        url: "/settings#data-sources-title",
        icon: East,
        description:
          "Configure data source settings to send user data to Dittofeed.",
      },
      {
        id: "email",
        title: "Email",
        type: "item",
        url: "/settings#email-title",
        icon: MailOutline,
        description:
          "Configure email settings, including the email provider credentials.",
      },
      {
        id: "write-keys",
        title: "Write Key",
        type: "item",
        url: "/settings#write-key-title",
        icon: Key,
        description:
          "Write key used to authenticate end user requests to the Dittofeed API.",
      },
    ],
  },
];

function SettingsLayout(
  props: Omit<React.ComponentProps<typeof Layout>, "items">
) {
  return <Layout items={menuItems} {...props} />;
}

interface SettingsState {
  sendgridProviderRequest: EphemeralRequestStatus<Error>;
  sendgridProviderApiKey: string;
  sendgridWebhookVerificationKeyRequest: EphemeralRequestStatus<Error>;
  sendgridWebhookVerificationKey: string;
  segmentIoRequest: EphemeralRequestStatus<Error>;
  segmentIoSharedSecret: string;
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
}

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
  }))
);

function SegmentIoConfig() {
  const theme = useTheme();
  const sharedSecret = useSettingsStore((store) => store.segmentIoSharedSecret);
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
  const handleSubmit = apiRequestHandlerFactory({
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

  const requestInProgress =
    segmentIoRequest.type === CompletionStatus.InProgress;

  return (
    <Stack sx={{ padding: 1, width: theme.spacing(65) }} spacing={1}>
      <TextField
        label="Shared Secret"
        variant="outlined"
        onChange={(e) => {
          updateSegmentIoSharedSecret(e.target.value);
        }}
        value={sharedSecret}
      />
      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={requestInProgress}
      >
        Save
      </Button>
    </Stack>
  );
}

function SendGridConfig() {
  const theme = useTheme();
  const emailProviders = useAppStore((store) => store.emailProviders);
  const apiKey = useSettingsStore((store) => store.sendgridProviderApiKey);
  const apiBase = useAppStore((store) => store.apiBase);
  const sendgridProviderRequest = useSettingsStore(
    (store) => store.sendgridProviderRequest
  );
  const updateSendgridProviderRequest = useSettingsStore(
    (store) => store.updateSendgridProviderRequest
  );
  const workspaceResult = useAppStore((store) => store.workspace);
  const upsertEmailProvider = useAppStore((store) => store.upsertEmailProvider);
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

  if (!workspace) {
    return null;
  }

  const body: UpsertEmailProviderResource = {
    id: savedSendgridProvider?.id,
    apiKey,
    type: EmailProviderType.Sendgrid,
    workspaceId: workspace.id,
  };
  const handleSubmit = apiRequestHandlerFactory({
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

  const requestInProgress =
    sendgridProviderRequest.type === CompletionStatus.InProgress;

  return (
    <Stack
      sx={{ padding: 1, width: theme.spacing(65) }}
      spacing={2}
      divider={<Divider />}
    >
      <Stack spacing={1}>
        <InfoBox>
          API key, used internally by Dittofeed to send emails via sendgrid.
        </InfoBox>
        <TextField
          label="API Key"
          variant="outlined"
          onChange={(e) => {
            updateSendgridProviderApiKey(e.target.value);
          }}
          value={apiKey}
        />
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={requestInProgress}
        >
          Save
        </Button>
      </Stack>
      <Stack spacing={1}>
        <InfoBox>
          Sendgrid webhook verification key, used to authenticate sendgrid
          webhook requests.
        </InfoBox>
        <SecretEditor secretName={SENDGRID_WEBHOOK_SECRET_NAME} />
      </Stack>
    </Stack>
  );
}

function WriteKeySettings() {
  const writeKey = useAppStore((store) => store.writeKeys)[0];
  const theme = useTheme();
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
    <Stack sx={{ width: "100%", p: 1 }} spacing={2}>
      <Typography variant="h2" sx={{ color: "black" }} id="write-key-title">
        Write Key
      </Typography>
      <Stack spacing={2}>
        <InfoBox
          sx={{
            display: "inline",
            maxWidth: theme.spacing(80),
          }}
        >
          Include this write key as an HTTP &quot;
          <Typography sx={{ fontFamily: "monospace" }} display="inline">
            Authorization: Basic ...
          </Typography>
          &quot; header in your requests. This write key can be included in your
          client, and does not need to be kept secret.
        </InfoBox>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography
            variant="body1"
            sx={{
              maxWidth: theme.spacing(80),
              overflow: "hidden",
              fontFamily: "monospace",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {keyHeader}
          </Typography>
          <IconButton
            color="primary"
            onClick={() => copyToClipboard(keyHeader)}
          >
            <ContentCopyOutlined />
          </IconButton>
        </Stack>
      </Stack>
    </Stack>
  );
}

function SubscriptionManagementSettings() {
  const subscriptionGroups = useAppStore((store) => store.subscriptionGroups);
  const [fromSubscriptionChange, setFromSubscriptionChange] =
    useState<boolean>(true);
  const [fromSubscribe, setFromSubscribe] = useState<boolean>(false);

  const workspaceResult = useAppStore((store) => store.workspace);
  const workspace =
    workspaceResult.type === CompletionStatus.Successful
      ? workspaceResult.value
      : null;

  const subscriptions =
    subscriptionGroups.type === CompletionStatus.Successful
      ? subscriptionGroups.value.map((sg, i) => ({
          name: sg.name,
          id: sg.id,
          isSubscribed: !(i === 0 && fromSubscriptionChange && !fromSubscribe),
        }))
      : [];

  if (!workspace) {
    return null;
  }
  const changedSubscription = fromSubscriptionChange
    ? subscriptions[0]?.id
    : undefined;

  return (
    <Collapaseable
      header={
        <Typography variant="h2" sx={{ color: "black" }}>
          Subscription Management
        </Typography>
      }
    >
      <Stack spacing={1}>
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
                  onChange={(e) => setFromSubscriptionChange(e.target.checked)}
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
    </Collapaseable>
  );
}

const Settings: NextPage<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = function Settings() {
  const { dashboardUrl } = useAppStorePick(["dashboardUrl"]);
  const [sendgridOpen, setSendgridOpen] = useState<boolean>(true);
  const [segmentIoOpen, setSegmentIoOpen] = useState<boolean>(true);
  const handleSendgridOpen = () => {
    setSendgridOpen((open) => !open);
  };
  const handleSegmentIoOpen = () => {
    setSegmentIoOpen((open) => !open);
  };

  return (
    <SettingsLayout>
      <Stack spacing={1} sx={{ padding: 2, width: "100%" }}>
        <ExternalLink
          href={`https://app.hubspot.com/oauth/authorize?client_id=9128468e-b771-4bab-b301-21b479213975&redirect_uri=${dashboardUrl}/dashboard/oauth2/callback/hubspot&scope=timeline%20sales-email-read%20crm.objects.contacts.read%20crm.objects.contacts.write%20crm.objects.companies.write%20crm.objects.companies.read%20crm.objects.owners.read%20crm.lists.write%20crm.lists.read`}
        >
          hubspot
        </ExternalLink>
        {/* FIXME add link to remove hubspot */}
        <Typography
          id="data-sources-title"
          variant="h2"
          sx={{ paddingLeft: 1 }}
        >
          Data Sources
        </Typography>
        <Box sx={{ paddingLeft: 1 }}>
          In order to use Dittofeed, one must configure at least 1 source of
          user data.
        </Box>
        <Box sx={{ width: "100%" }}>
          <Button variant="text" onClick={handleSegmentIoOpen}>
            <Typography variant="h4" sx={{ color: "black" }}>
              Using Segment.io
            </Typography>
          </Button>
          <ExpandMore
            expand={segmentIoOpen}
            onClick={handleSegmentIoOpen}
            aria-expanded={segmentIoOpen}
            aria-label="show more"
          >
            <ExpandMoreIcon />
          </ExpandMore>
        </Box>
        <Collapse in={segmentIoOpen} unmountOnExit>
          <SegmentIoConfig />
        </Collapse>
        <Typography id="email-title" variant="h2" sx={{ paddingLeft: 1 }}>
          Email Providers
        </Typography>
        <Box sx={{ paddingLeft: 1 }}>
          In order to use email, one must configure at least 1 email provider.
        </Box>
        <Box sx={{ width: "100%" }}>
          <Button variant="text" onClick={handleSendgridOpen}>
            <Typography variant="h4" sx={{ color: "black" }}>
              Using SendGrid
            </Typography>
          </Button>
          <ExpandMore
            expand={sendgridOpen}
            onClick={handleSendgridOpen}
            aria-expanded={sendgridOpen}
            aria-label="show more"
          >
            <ExpandMoreIcon />
          </ExpandMore>
        </Box>
        <Collapse in={sendgridOpen} unmountOnExit>
          <SendGridConfig />
        </Collapse>
        <SubscriptionManagementSettings />
        <WriteKeySettings />
      </Stack>
    </SettingsLayout>
  );
};
export default Settings;
