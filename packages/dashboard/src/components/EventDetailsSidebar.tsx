// EventDetailsSidebar.tsx
import React from "react";
import { Drawer, Typography, Box } from "@mui/material";

interface EventDetailsSidebarProps {
  open: boolean;
  onClose: () => void;
  selectedEvent: {
    messageId: string;
    eventType: string;
    event: string;
    userId: string | null;
    anonymousId: string | null;
    processingTime: string;
    eventTime: string;
    traits: string;
  } | null;
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
        <Typography variant="h6">Event Details</Typography>
        {selectedEvent && (
          <>
            <Typography>{`Event Type: ${selectedEvent.eventType}`}</Typography>
            <Typography>{`Event Time: ${selectedEvent.eventTime}`}</Typography>
            <Typography>{`User ID: ${
              selectedEvent.userId || "N/A"
            }`}</Typography>
            <Typography>{`Anonymous ID: ${
              selectedEvent.anonymousId || "N/A"
            }`}</Typography>
            <Typography>{`Traits: ${selectedEvent.traits}`}</Typography>
            {/* Add more details as needed */}
          </>
        )}
      </Box>
    </Drawer>
  );
};

export default EventDetailsSidebar;
