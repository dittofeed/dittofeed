import { AddCircleOutline } from "@mui/icons-material";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { findManyJourneyResourcesUnsafe } from "backend-lib/src/journeys";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { CHANNEL_NAMES } from "isomorphic-lib/src/constants";
import { ChannelType, CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useState } from "react";
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
      findManyJourneyResourcesUnsafe({
        where: { workspaceId, resourceType: "Declarative" },
      }),
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
  const [newAnchorEl, setNewAnchorEl] = useState<null | HTMLElement>(null);
  const [newItemId, setNewItemId] = useState(() => uuid());

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
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
          <MenuItem component={Link} href={`/templates/webhook/${newItemId}`}>
            Webhook
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
