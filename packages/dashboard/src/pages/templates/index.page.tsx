import { AddCircleOutline } from "@mui/icons-material";
import {
  Box,
  IconButton,
  List,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { Journey } from "@prisma/client";
import { Type } from "@sinclair/typebox";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  EmailTemplateResource,
  JourneyDefinition,
  JourneyNodeType,
  MessageTemplateResourceRequest,
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
import TemplatesTable from "../../components/templatesTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const QueryParams = Type.Pick(MessageTemplateResourceRequest, [
  "cursor",
  "direction",
]);

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
    const journeys = await prisma().journey.findMany({
      where: { workspaceId },
    });
    const usedBy: Record<string, Journey[]> = {};
    for (const template of templates) {
      for (const journey of journeys) {
        for (const node of (journey.definition as JourneyDefinition).nodes) {
          if (
            node.type === JourneyNodeType.MessageNode &&
            node.variant.templateId === template.id
          ) {
            usedBy[template.id] = usedBy[template.id] ?? [];
            usedBy[template.id]?.push(journey);
          }
        }
      }
    }

    const messages: AppState["messages"] = {
      type: CompletionStatus.Successful,
      value: templates.map((template) => ({
        ...template,
        journeys:
          usedBy[template.id] && usedBy[template.id]?.length !== 0
            ? usedBy[template.id]
                ?.map((journey) => `${journey.name}, `)
                ?.join(`, \n`)
            : "No Journey",
      })),
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

function TemplateListContents() {
  const enableMobilePush = useAppStore((store) => store.enableMobilePush);
  const [tab, setTab] = useState<number>(0);
  const [newAnchorEl, setNewAnchorEl] = useState<null | HTMLElement>(null);
  const messagesResult = useAppStore((store) => store.messages);
  const [newItemId, setNewItemId] = useState(() => uuid());

  const router = useRouter();
  const queryParams = useMemo(
    () => schemaValidate(router.query, QueryParams).unwrapOr({}),
    [router.query]
  );
  const workspace = useAppStore((state) => state.workspace);

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
        const definition = template.draft ?? template.definition;
        if (!definition) {
          return acc;
        }
        switch (definition.type) {
          case ChannelType.Email:
            acc.emailTemplates.push({
              ...template,
              definition,
            });
            break;
          case ChannelType.MobilePush:
            acc.mobilePushTemplates.push({
              ...template,
              definition,
            });
            break;
          case ChannelType.Sms:
            acc.smsTemplates.push({
              ...template,
              definition,
            });
            break;
          default: {
            const { type } = definition;
            assertUnreachable(type);
          }
        }
        return acc;
      },
      { emailTemplates: [], mobilePushTemplates: [], smsTemplates: [] }
    );
  }, [messagesResult]);

  if (workspace.type !== CompletionStatus.Successful) {
    return null;
  }

  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        maxWidth: "70rem",
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
          <TemplatesTable label={CHANNEL_NAMES[ChannelType.Email]} />

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
          <TemplatesTable
            {...queryParams}
            label={CHANNEL_NAMES[ChannelType.Sms]}
          />
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
          <TemplatesTable
            {...queryParams}
            label={CHANNEL_NAMES[ChannelType.MobilePush]}
          />
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
