// EventDetailsSidebar.tsx
import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import Link from "next/link";
import React, { useMemo } from "react";

import { EventResources } from "../lib/types";
import { SubtleHeader } from "./headers";
import InfoTooltip from "./infoTooltip";

interface SelectedEvent {
  [x: string]: unknown;
  messageId: string;
  eventType: string;
  event: string;
  userId: string | null;
  anonymousId: string | null;
  processingTime: string;
  eventTime: string;
  traits: string;
}
interface EventDetailsSidebarProps {
  open: boolean;
  onClose: () => void;
  selectedEvent: SelectedEvent | null;
  eventResources: EventResources[];
}

const EventDetailsSidebar: React.FC<EventDetailsSidebarProps> =
  function EventDetailsSidebar({
    open,
    onClose,
    selectedEvent,
    eventResources,
  }) {
    const theme = useTheme();
    const formattedTraits = useMemo(() => {
      if (selectedEvent?.traits) {
        try {
          return JSON.stringify(JSON.parse(selectedEvent.traits), null, 2);
        } catch (e) {
          return selectedEvent.traits;
        }
      }
      return "";
    }, [selectedEvent?.traits]);
    return (
      <Drawer open={open} onClose={onClose} anchor="right">
        <Stack
          padding={2}
          paddingTop={10}
          sx={{ maxWidth: "25vw" }}
          spacing={2}
        >
          <SubtleHeader>Event Details</SubtleHeader>
          <Stack spacing={1}>
            {selectedEvent &&
              Object.keys(selectedEvent).map((key) =>
                key !== "traits" ? (
                  <Typography key={key} fontFamily="monospace">
                    {`${key}: ${selectedEvent[key as keyof SelectedEvent]}`}
                  </Typography>
                ) : null,
              )}
          </Stack>

          {selectedEvent?.traits && (
            <>
              <InfoTooltip title="Properties">
                <Typography variant="h5">Properties</Typography>
              </InfoTooltip>
              <ReactCodeMirror
                value={formattedTraits}
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
            </>
          )}
          {eventResources.length > 0 && (
            <>
              <InfoTooltip title="Related Resources">
                <Typography variant="h5">Related Resources</Typography>
              </InfoTooltip>
              <List>
                {eventResources.map((currResource) => (
                  <ListItem key={currResource.key} disablePadding>
                    <ListItemButton component={Link} href={currResource.link}>
                      <ListItemText
                        sx={{
                          fontSize: "1rem",
                        }}
                        primary={currResource.name}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Stack>
      </Drawer>
    );
  };

export default EventDetailsSidebar;
