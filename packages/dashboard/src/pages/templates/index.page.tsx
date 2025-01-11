import { AddCircleOutline } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import * as schema from "backend-lib/src/db/schema";
import { findManyJourneyResourcesUnsafe } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { and, eq } from "drizzle-orm";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { messageTemplatePath } from "isomorphic-lib/src/messageTemplates";
import {
  ChannelType,
  CompletionStatus,
  EmailContentsType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import TemplatesTable from "../../components/templatesTable";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
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
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      sx={{
        p: 1,
        flex: 1,
        borderRadius: 1,
        bgcolor: "background.paper",
      }}
      {...other}
    >
      {children}
    </Box>
  );
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;

    const [templates, journeyResources] = await Promise.all([
      findMessageTemplates({
        workspaceId,
      }),
      findManyJourneyResourcesUnsafe(
        and(
          eq(schema.journey.workspaceId, workspaceId),
          eq(schema.journey.resourceType, "Declarative"),
        ),
      ),
    ]);

    const messages: AppState["messages"] = {
      type: CompletionStatus.Successful,
      value: templates,
    };

    const journeys: AppState["journeys"] = {
      type: CompletionStatus.Successful,
      value: journeyResources,
    };

    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
        serverInitialState: {
          messages,
          journeys,
        },
      }),
    };
  });

function TemplateListContents() {
  const enableMobilePush = useAppStore((store) => store.enableMobilePush);
  const [tab, setTab] = useState<number>(0);
  const [newItemId, setNewItemId] = useState(() => uuid());
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [selectedTemplateType, setSelectedTemplateType] = useState<ChannelType>(
    ChannelType.Email,
  );
  const [emailContentType, setEmailContentType] = useState<EmailContentsType>(
    EmailContentsType.LowCode,
  );
  const router = useRouter();

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  };

  const handleCreateTemplate = () => {
    const queryParams = new URLSearchParams();
    queryParams.set("name", newName);
    if (selectedTemplateType === ChannelType.Email) {
      queryParams.set("emailContentType", emailContentType);
    }
    setOpenCreateDialog(false);
    router.push(
      `${messageTemplatePath({
        id: newItemId,
        channel: selectedTemplateType,
      })}?${queryParams.toString()}`,
    );
  };
  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          Message Library
        </Typography>
        <Button
          startIcon={<AddCircleOutline />}
          variant="contained"
          onClick={() => {
            setNewItemId(uuid());
            setOpenCreateDialog(true);
          }}
        >
          Create Template
        </Button>
        <Dialog
          open={openCreateDialog}
          TransitionProps={{
            onEntered: () => {
              inputRef.current?.focus();
            },
          }}
          onClose={() => setOpenCreateDialog(false)}
        >
          <DialogTitle>Create New Template</DialogTitle>
          <DialogContent>
            <Stack alignItems="flex-start">
              <TextField
                sx={{ width: "100%", mt: 2 }}
                label="Name"
                inputRef={inputRef}
                value={newName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateTemplate();
                  }
                }}
                onChange={(e) => setNewName(e.target.value)}
              />
              <ToggleButtonGroup
                value={selectedTemplateType}
                exclusive
                color="primary"
                onChange={(_, newType) => {
                  if (newType !== null) {
                    setSelectedTemplateType(newType);
                  }
                }}
                aria-label="template type"
                sx={{ display: "flex", justifyContent: "center", mt: 2 }}
              >
                <ToggleButton value={ChannelType.Email} aria-label="email">
                  Email
                </ToggleButton>
                <ToggleButton value={ChannelType.Sms} aria-label="sms">
                  SMS
                </ToggleButton>
                <ToggleButton value={ChannelType.Webhook} aria-label="webhook">
                  Webhook
                </ToggleButton>
                <ToggleButton
                  value={ChannelType.MobilePush}
                  aria-label="mobile push"
                  disabled={!enableMobilePush}
                >
                  Mobile Push
                </ToggleButton>
              </ToggleButtonGroup>
              {selectedTemplateType === ChannelType.Email && (
                <ToggleButtonGroup
                  value={emailContentType}
                  exclusive
                  color="primary"
                  onChange={(_, newType) => {
                    if (newType !== null) {
                      setEmailContentType(newType);
                    }
                  }}
                  aria-label="email content type"
                  sx={{ display: "flex", justifyContent: "center", mt: 2 }}
                >
                  <ToggleButton
                    value={EmailContentsType.LowCode}
                    aria-label="low code"
                  >
                    Low Code
                  </ToggleButton>
                  <ToggleButton
                    value={EmailContentsType.Code}
                    aria-label="code"
                  >
                    Code
                  </ToggleButton>
                </ToggleButtonGroup>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenCreateDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!newName}
              onClick={handleCreateTemplate}
            >
              Create
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={handleChange}
          aria-label="basic tabs example"
        >
          <Tab label={CHANNEL_NAMES[ChannelType.Email]} />
          <Tab label={CHANNEL_NAMES[ChannelType.Sms]} />
          <Tab label={CHANNEL_NAMES[ChannelType.Webhook]} />
          <Tab label={CHANNEL_NAMES[ChannelType.MobilePush]} />
        </Tabs>
      </Box>
      <TabPanel value={tab} index={0}>
        <TemplatesTable label={CHANNEL_NAMES[ChannelType.Email]} />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <TemplatesTable label={CHANNEL_NAMES[ChannelType.Sms]} />
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <TemplatesTable label={CHANNEL_NAMES[ChannelType.Webhook]} />
      </TabPanel>
      <TabPanel value={tab} index={3}>
        <TemplatesTable label={CHANNEL_NAMES[ChannelType.MobilePush]} />
      </TabPanel>
    </Stack>
  );
}

export default function TemplateList() {
  return (
    <DashboardContent>
      <TemplateListContents />
    </DashboardContent>
  );
}
