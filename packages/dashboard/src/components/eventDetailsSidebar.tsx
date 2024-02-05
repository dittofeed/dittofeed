// EventDetailsSidebar.tsx
import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Box, Drawer, Typography, useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import { useRouter } from "next/router";
import React from "react";

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
    const router = useRouter();
    return (
      <Drawer open={open} onClose={onClose} anchor="right">
        <Box padding={2} paddingTop={10} sx={{ maxWidth: "25vw" }}>
          <SubtleHeader>Event Details</SubtleHeader>
          {selectedEvent &&
            Object.keys(selectedEvent).map((key) =>
              key !== "traits" ? (
                <Typography key={key} fontFamily="monospace">
                  {`${key}: ${selectedEvent[key as keyof SelectedEvent]}`}
                </Typography>
              ) : null,
            )}

          {selectedEvent?.traits && (
            <>
              <InfoTooltip title="Traits">
                <Typography variant="h5">Traits</Typography>
              </InfoTooltip>
              <ReactCodeMirror
                value={selectedEvent.traits}
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
              {eventResources.map((currResource) => {
                return (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                  <span
                    key={currResource.key}
                    onClick={() => {
                      router.push({
                        pathname: currResource.link,
                      });
                    }}
                  >
                    <Typography fontFamily="monospace">
                      {`${currResource.name}`}
                    </Typography>
                  </span>
                );
              })}
            </>
          )}
        </Box>
      </Drawer>
    );
  };

export default EventDetailsSidebar;
