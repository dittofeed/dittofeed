import { ArrowBackIos, MailOutline } from "@mui/icons-material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  IconButtonProps,
  Stack,
  styled,
  TextField,
  Typography,
} from "@mui/material";
import axios, { AxiosResponse } from "axios";
import backendConfig from "backend-lib/src/config";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  EmailProviderResource,
  EmailProviderType,
  EphemeralRequestStatus,
  PersistedEmailProvider,
} from "isomorphic-lib/src/types";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";
import { useMemo, useState } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import Layout from "../../components/layout";
import { MenuItemGroup } from "../../components/menuItems/types";
import {
  PreloadedState,
  PropsWithInitialState,
  useAppStore,
} from "../../lib/appStore";
import config from "../../lib/config";
import prisma from "../../lib/prisma";

interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  const workspaceId = backendConfig().defaultWorkspaceId;

  const [emailProviders, defaultEmailProviderRecord, workspace] =
    await Promise.all([
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
      prisma().workspace.findFirst({
        where: { id: workspaceId },
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
  };
  if (workspace) {
    // TODO PLI-212
    serverInitialState.workspace = {
      type: CompletionStatus.Successful,
      value: {
        id: workspaceId,
        name: workspace.name,
      },
    };
  }

  return {
    props: {
      serverInitialState,
    },
  };
};

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
        url: "/dashboard",
        target: true,
        icon: ArrowBackIos,
        description: "Exit settings, and return to the home page.",
      },
      {
        id: "email",
        title: "Email",
        type: "item",
        url: "/dashboard/settings#email-title",
        target: true,
        icon: MailOutline,
        description:
          "Configure email settings, including the email provider credentials.",
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
}

interface SettingsActions {
  updateSendgridProviderApiKey: (key: string) => void;
  updateSendgridProviderRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
}

export const useSettingsStore = create(
  immer<SettingsActions & SettingsState>((set) => ({
    sendgridProviderRequest: {
      type: CompletionStatus.NotStarted,
    },
    sendgridProviderApiKey: "",
    sendgridFromEmail: "",
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
  }))
);

function SendGridConfig() {
  const emailProviders = useAppStore((store) => store.emailProviders);
  const apiKey = useSettingsStore((store) => store.sendgridProviderApiKey);
  const sendgridProviderRequest = useSettingsStore(
    (store) => store.sendgridProviderRequest
  );
  const updateSendgridProviderRequest = useSettingsStore(
    (store) => store.updateSendgridProviderRequest
  );
  const workspace = useAppStore((store) => store.workspace);
  const upsertEmailProvider = useAppStore((store) => store.upsertEmailProvider);
  const updateSendgridProviderApiKey = useSettingsStore(
    (store) => store.updateSendgridProviderApiKey
  );
  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  const savedSendgridProvider: EmailProviderResource | null = useMemo(() => {
    if (emailProviders.type !== CompletionStatus.Successful || !workspaceId) {
      return null;
    }
    for (const emailProvider of emailProviders.value) {
      if (emailProvider.workspaceId === workspaceId) {
        return emailProvider;
      }
    }
    return null;
  }, [emailProviders, workspaceId]);

  const handleSubmit = async () => {
    if (sendgridProviderRequest.type === CompletionStatus.InProgress) {
      return;
    }

    updateSendgridProviderRequest({
      type: CompletionStatus.InProgress,
    });
    let response: AxiosResponse;
    try {
      response = await axios.put(
        `${config.apiProtocol}://${config.apiHost}/api/settings/email-providers`,
        {
          id: savedSendgridProvider?.id,
          apiKey,
          type: EmailProviderType.Sendgrid,
          workspaceId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } catch (e) {
      const error = e as Error;

      updateSendgridProviderRequest({
        type: CompletionStatus.Failed,
        error,
      });
      return;
    }
    const emailProviderResult = schemaValidate(
      response.data,
      PersistedEmailProvider
    );
    if (emailProviderResult.isErr()) {
      console.error(
        "unable to parse email provider",
        emailProviderResult.error
      );

      updateSendgridProviderRequest({
        type: CompletionStatus.Failed,
        error: new Error(JSON.stringify(emailProviderResult.error)),
      });
      return;
    }

    upsertEmailProvider(emailProviderResult.value);
    updateSendgridProviderRequest({
      type: CompletionStatus.NotStarted,
    });
  };

  const upToDate = savedSendgridProvider?.apiKey === apiKey;
  return (
    <Stack sx={{ padding: 1 }} spacing={1}>
      <TextField
        label="API Key"
        variant="outlined"
        onChange={(e) => {
          updateSendgridProviderApiKey(e.target.value);
        }}
        value={apiKey}
      />
      <Button onClick={handleSubmit} variant="contained" disabled={upToDate}>
        {upToDate ? "Saved" : "Save"}
      </Button>
    </Stack>
  );
}

const Settings: NextPage<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = function Settings() {
  const [sendgridOpen, setSendgridOpen] = useState<boolean>(true);
  const handleSendgridOpen = () => {
    setSendgridOpen((open) => !open);
  };

  return (
    <SettingsLayout>
      <Stack spacing={1} sx={{ padding: 2, width: 500 }}>
        <Typography id="email-title" variant="h2" sx={{ paddingLeft: 1 }}>
          Email Providers
        </Typography>
        <Box sx={{ paddingLeft: 1 }}>
          In order to use email, one must configure at least 1 email provider.
        </Box>
        <Box sx={{ width: "100%" }}>
          <Button variant="text" onClick={handleSendgridOpen}>
            <Typography variant="h4" sx={{ color: "black" }}>
              Using Sendgrid
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
      </Stack>
    </SettingsLayout>
  );
};
export default Settings;
