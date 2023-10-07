import { AddCircleOutline, Delete } from "@mui/icons-material";
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  DeleteMessageTemplateRequest,
  EmailTemplateResource,
  EmptyResponse,
  MessageTemplateResource,
  MobilePushTemplateResource,
  NarrowedMessageTemplateResource,
  SmsTemplateResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";

import MainLayout from "../../components/mainLayout";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          <Typography component="span">{children}</Typography>
        </Box>
      )}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;

    const templates = await findMessageTemplates({
      workspaceId,
    });
    const messages: AppState["messages"] = {
      type: CompletionStatus.Successful,
      value: templates,
    };

    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
        serverInitialState: {
          messages,
        },
      }),
    };
  });

function TemplateListItem({ template }: { template: MessageTemplateResource }) {
  const path = useRouter();

  const setMessageTemplateDeleteRequest = useAppStore(
    (store) => store.setMessageTemplateDeleteRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const messageTemplateDeleteRequest = useAppStore(
    (store) => store.messageTemplateDeleteRequest
  );
  const deleteMessageTemplate = useAppStore((store) => store.deleteMessage);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteMessageTemplateRequest
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteMessageTemplate(deleteRequest.id);
  };

  const deleteData: DeleteMessageTemplateRequest = {
    id: template.id,
    type: template.definition.type,
  };
  const handleDelete = apiRequestHandlerFactory({
    request: messageTemplateDeleteRequest,
    setRequest: setMessageTemplateDeleteRequest,
    responseSchema: EmptyResponse,
    setResponse: setDeleteResponse,
    onSuccessNotice: `Deleted template ${template.name}.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to delete template ${template.name}.`,
    requestConfig: {
      method: "DELETE",
      url: `${apiBase}/api/content/templates`,
      data: deleteData,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });
  return (
    <ListItem
      secondaryAction={
        <IconButton edge="end" onClick={handleDelete}>
          <Delete />
        </IconButton>
      }
    >
      <ListItemButton
        sx={{
          border: 1,
          borderRadius: 1,
          borderColor: "grey.200",
        }}
        onClick={() => {
          let messageType: string;
          switch (template.definition.type) {
            case ChannelType.Email:
              messageType = "email";
              break;
            case ChannelType.MobilePush:
              messageType = "mobile-push";
              break;
            case ChannelType.Sms:
              messageType = "sms";
              break;
          }
          path.push(`/templates/${messageType}/${template.id}`);
        }}
      >
        <ListItemText primary={template.name} />
      </ListItemButton>
    </ListItem>
  );
}

function TemplateListContents() {
  const enableMobilePush = useAppStore((store) => store.enableMobilePush);
  const [tab, setTab] = useState<number>(0);
  const [newAnchorEl, setNewAnchorEl] = useState<null | HTMLElement>(null);
  const messagesResult = useAppStore((store) => store.messages);
  const [newItemId, setNewItemId] = useState(() => uuid());

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  };
  const { emailTemplates, mobilePushTemplates, smsTemplates } = useMemo(() => {
    const messages =
      messagesResult.type === CompletionStatus.Successful
        ? messagesResult.value
        : [];
    return messages.reduce<{
      emailTemplates: NarrowedMessageTemplateResource<EmailTemplateResource>[];
      mobilePushTemplates: NarrowedMessageTemplateResource<MobilePushTemplateResource>[];
      smsTemplates: NarrowedMessageTemplateResource<SmsTemplateResource>[];
    }>(
      (acc, template) => {
        switch (template.definition.type) {
          case ChannelType.Email:
            acc.emailTemplates.push({
              ...template,
              definition: template.definition,
            });
            break;
          case ChannelType.MobilePush:
            acc.mobilePushTemplates.push({
              ...template,
              definition: template.definition,
            });
            break;
          case ChannelType.Sms:
            acc.smsTemplates.push({
              ...template,
              definition: template.definition,
            });
            break;
          default: {
            const { type } = template.definition;
            assertUnreachable(type);
          }
        }
        return acc;
      },
      { emailTemplates: [], mobilePushTemplates: [], smsTemplates: [] }
    );
  }, [messagesResult]);

  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        maxWidth: "40rem",
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          Message Library
        </Typography>
        <IconButton
          onClick={(event: React.MouseEvent<HTMLElement>) => {
            setNewItemId(uuid());
            setNewAnchorEl(event.currentTarget);
          }}
        >
          <AddCircleOutline />
        </IconButton>
        <Menu
          open={Boolean(newAnchorEl)}
          onClose={() => setNewAnchorEl(null)}
          anchorEl={newAnchorEl}
        >
          <MenuItem component={Link} href={`/templates/email/${newItemId}`}>
            Email
          </MenuItem>
          <MenuItem component={Link} href={`/templates/sms/${newItemId}`}>
            SMS
          </MenuItem>
          <MenuItem
            component={Link}
            disabled={!enableMobilePush}
            href={`/templates/mobile-push/${newItemId}`}
          >
            Mobile Push
          </MenuItem>
        </Menu>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={handleChange}
          aria-label="basic tabs example"
        >
          <Tab label={CHANNEL_NAMES[ChannelType.Email]} />
          <Tab label={CHANNEL_NAMES[ChannelType.Sms]} />
          <Tab label={CHANNEL_NAMES[ChannelType.MobilePush]} />
        </Tabs>
      </Box>
      <TabPanel value={tab} index={0}>
        <List
          sx={{
            width: "100%",
            bgcolor: "background.paper",
            borderRadius: 1,
          }}
        >
          {emailTemplates.map((template) => (
            <TemplateListItem template={template} key={template.id} />
          ))}

          {emailTemplates.length === 0 && (
            <Typography
              component="span"
              textAlign="center"
              sx={{
                padding: "20px 16px",
              }}
            >
              You haven&apos;t created any email templates.
            </Typography>
          )}
        </List>
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <List
          sx={{
            width: "100%",
            bgcolor: "background.paper",
            borderRadius: 1,
          }}
        >
          {smsTemplates.map((template) => (
            <TemplateListItem template={template} key={template.id} />
          ))}
          {smsTemplates.length === 0 && (
            <Typography
              component="span"
              textAlign="center"
              sx={{
                padding: "20px 16px",
              }}
            >
              You haven&apos;t created any SMS templates.
            </Typography>
          )}
        </List>
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <List
          sx={{
            width: "100%",
            bgcolor: "background.paper",
            borderRadius: 1,
          }}
        >
          {mobilePushTemplates.map((template) => (
            <TemplateListItem template={template} key={template.id} />
          ))}
          {mobilePushTemplates.length === 0 && (
            <Typography
              component="span"
              textAlign="center"
              sx={{
                padding: "20px 16px",
              }}
            >
              You haven&apos;t created any mobile push templates.
            </Typography>
          )}
        </List>
      </TabPanel>
    </Stack>
  );
}

export default function TemplateList() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <TemplateListContents />
        </MainLayout>
      </main>
    </>
  );
}
