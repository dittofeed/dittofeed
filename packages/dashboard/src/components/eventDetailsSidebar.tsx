// EventDetailsSidebar.tsx
import React from "react";
import { Drawer, Typography, Box } from "@mui/material";
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
  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      slotProps={{ backdrop: { onClick: onClose } }}
    >
      <Box padding={2} paddingTop={10}>
        <Typography fontFamily={"monospace"} variant="h2">
          Event Details
        </Typography>
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
            <Typography fontFamily={"monospace"}>Traits:</Typography>
            <Typography>
              <pre>
                {JSON.stringify(JSON.parse(selectedEvent.traits), null, 2)}
              </pre>
            </Typography>
          </>
        )}
      </Box>
    </Drawer>
  );
};

export default EventDetailsSidebar;
