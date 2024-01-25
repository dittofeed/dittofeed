// EventDetailsSidebar.tsx
import React from "react";
import { Drawer, Typography, Box, useTheme } from "@mui/material";
import InfoTooltip from "./infoTooltip";
import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import ReactCodeMirror from "@uiw/react-codemirror";
import { SubtleHeader } from "./headers";
type SelectedEvent = {
  [x: string]: any;
  messageId: string;
  eventType: string;
  event: string;
  userId: string | null;
  anonymousId: string | null;
  processingTime: string;
  eventTime: string;
  traits: string;
};
interface EventDetailsSidebarProps {
  open: boolean;
  onClose: () => void;
  selectedEvent: SelectedEvent | null;
}

const EventDetailsSidebar: React.FC<EventDetailsSidebarProps> = ({
  open,
  onClose,
  selectedEvent,
}) => {
  const theme = useTheme();
  return (
    <Drawer open={open} onClose={onClose} anchor="right">
      <Box padding={2} paddingTop={10} sx={{ maxWidth: "25vw" }}>
        <SubtleHeader>
          Event Details
        </SubtleHeader>
        {selectedEvent &&
          Object.keys(selectedEvent).map((key) => {
            return key !== "traits" ? (
              <Typography key={key} fontFamily={"monospace"}>
                {`${key}: ${selectedEvent[key as keyof SelectedEvent]}`}
              </Typography>
            ) : (
              <></>
            );
          })}

        {selectedEvent && selectedEvent.traits && (
          <>
            <InfoTooltip title={"Traits"}>
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
      </Box>
    </Drawer>
  );
};

export default EventDetailsSidebar;
