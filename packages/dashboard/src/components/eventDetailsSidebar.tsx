import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import {
  Close as CloseIcon,
  ContentCopy as ContentCopyIcon,
  Link as LinkIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import Link from "next/link";
import React, { useMemo, useState } from "react";

import { EventResources } from "../lib/types";

interface SelectedEvent {
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

function CopyableField({
  label,
  value,
  monospace = false,
  onCopy,
}: {
  label: string;
  value: string | null;
  monospace?: boolean;
  onCopy: (value: string, label: string) => void;
}) {
  if (!value) {
    return (
      <Box sx={{ mb: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mb: 0.25, display: "block" }}
        >
          {label}
        </Typography>
        <Typography color="text.disabled">—</Typography>
      </Box>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    onCopy(value, label);
  };

  return (
    <Box sx={{ mb: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mb: 0.25, display: "block" }}
      >
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography
          variant="body2"
          sx={{
            fontFamily: monospace ? "monospace" : "inherit",
            wordBreak: "break-all",
            flex: 1,
            fontSize: "0.8rem",
          }}
        >
          {value}
        </Typography>
        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}
        >
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}

function TimeField({ label, timestamp }: { label: string; timestamp: string }) {
  const date = new Date(timestamp);
  const relative = formatDistanceToNow(date, { addSuffix: true });
  const absolute = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(date);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mb: 0.5, display: "block" }}
      >
        {label}
      </Typography>
      <Stack spacing={0.5}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {relative}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "monospace" }}
        >
          {absolute}
        </Typography>
      </Stack>
    </Box>
  );
}

function EventDetailsSidebar({
  open,
  onClose,
  selectedEvent,
  eventResources,
}: EventDetailsSidebarProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });

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

  const getEventTypeColor = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case "track":
        return "primary";
      case "identify":
        return "secondary";
      case "page":
        return "info";
      case "screen":
        return "success";
      case "group":
        return "warning";
      case "alias":
        return "error";
      default:
        return "default";
    }
  };

  if (!selectedEvent) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      sx={{
        "& .MuiDrawer-paper": {
          width: "500px",
          maxWidth: "40vw",
        },
      }}
    >
      <Stack sx={{ height: "100%", overflow: "hidden" }}>
        {/* Header */}
        <Paper
          elevation={1}
          sx={{
            p: 2,
            borderRadius: 0,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6">Event Details</Typography>
              <Chip
                label={selectedEvent.eventType}
                color={
                  getEventTypeColor(selectedEvent.eventType) as
                    | "primary"
                    | "secondary"
                    | "info"
                    | "success"
                    | "warning"
                    | "error"
                    | "default"
                }
                size="small"
                variant="outlined"
              />
            </Stack>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Paper>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            sx={{ minHeight: 48 }}
          >
            <Tab label="Overview" sx={{ minHeight: 48 }} />
            <Tab label="Properties" sx={{ minHeight: 48 }} />
          </Tabs>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {activeTab === 0 && (
            <Stack spacing={2}>
              {/* Event Overview */}
              <Card variant="outlined">
                <CardHeader
                  title="Event Overview"
                  titleTypographyProps={{ variant: "subtitle1", fontWeight: 600 }}
                  sx={{ pb: 0.5, px: 2, pt: 1.5 }}
                />
                <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
                  <Stack spacing={1}>
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mb: 0.25, display: "block" }}
                      >
                        Event Name
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontFamily: "monospace", fontSize: "1rem" }}>
                        {selectedEvent.event}
                      </Typography>
                    </Box>

                    <TimeField
                      label="Event Time"
                      timestamp={selectedEvent.eventTime}
                    />
                    <TimeField
                      label="Processing Time"
                      timestamp={selectedEvent.processingTime}
                    />
                  </Stack>
                </CardContent>
              </Card>

              {/* User Information */}
              <Card variant="outlined">
                <CardHeader
                  title="User Information"
                  titleTypographyProps={{ variant: "subtitle1", fontWeight: 600 }}
                  avatar={<PersonIcon color="action" />}
                  sx={{ pb: 0.5, px: 2, pt: 1.5 }}
                />
                <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
                  <Stack spacing={1}>
                    <CopyableField
                      label="User ID"
                      value={selectedEvent.userId}
                      monospace
                      onCopy={(value, label) =>
                        setSnackbar({ open: true, message: `${label} copied to clipboard` })
                      }
                    />
                    <CopyableField
                      label="Anonymous ID"
                      value={selectedEvent.anonymousId}
                      monospace
                      onCopy={(value, label) =>
                        setSnackbar({ open: true, message: `${label} copied to clipboard` })
                      }
                    />
                    <CopyableField
                      label="Message ID"
                      value={selectedEvent.messageId}
                      monospace
                      onCopy={(value, label) =>
                        setSnackbar({ open: true, message: `${label} copied to clipboard` })
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>

              {/* Related Resources */}
              {eventResources.length > 0 && (
                <Card variant="outlined">
                  <CardHeader
                    title="Related Resources"
                    titleTypographyProps={{
                      variant: "subtitle1",
                      fontWeight: 600,
                    }}
                    avatar={<LinkIcon color="action" />}
                    sx={{ pb: 0.5, px: 2, pt: 1.5 }}
                  />
                  <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
                    <List disablePadding>
                      {eventResources.map((resource, index) => (
                        <React.Fragment key={resource.key}>
                          <ListItem disablePadding>
                            <ListItemButton
                              component={Link}
                              href={resource.link}
                              sx={{
                                borderRadius: 1,
                                py: 0.5,
                                "&:hover": {
                                  backgroundColor: "action.hover",
                                },
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 30 }}>
                                <LinkIcon fontSize="small" color="primary" />
                              </ListItemIcon>
                              <ListItemText
                                primary={resource.name}
                                primaryTypographyProps={{
                                  fontFamily: "monospace",
                                  fontSize: "0.8rem",
                                }}
                              />
                            </ListItemButton>
                          </ListItem>
                          {index < eventResources.length - 1 && (
                            <Divider sx={{ my: 0.25 }} />
                          )}
                        </React.Fragment>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              )}
            </Stack>
          )}

          {activeTab === 1 && (
            <Stack spacing={2}>
              {/* Properties */}
              {selectedEvent.traits && (
                <Card variant="outlined">
                  <CardHeader
                    title="Event Properties"
                    titleTypographyProps={{
                      variant: "subtitle1",
                      fontWeight: 600,
                    }}
                    sx={{ pb: 0.5, px: 2, pt: 1.5 }}
                  />
                  <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
                    <Box
                      sx={{
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 1,
                        overflow: "hidden",
                        height: "500px",
                        "& .cm-editor": {
                          fontSize: "0.7rem",
                        },
                        "& .cm-focused": {
                          outline: "none",
                        },
                      }}
                    >
                      <ReactCodeMirror
                        value={formattedTraits}
                        readOnly
                        height="500px"
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: true,
                          dropCursor: false,
                          allowMultipleSelections: false,
                        }}
                        extensions={[
                          codeMirrorJson(),
                          linter(jsonParseLinter()),
                          EditorView.lineWrapping,
                          EditorView.theme({
                            "&": {
                              fontFamily:
                                "Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
                            },
                            ".cm-content": {
                              padding: "8px",
                            },
                            ".cm-gutters": {
                              backgroundColor: theme.palette.grey[50],
                              borderRight: `1px solid ${theme.palette.divider}`,
                            },
                          }),
                          lintGutter(),
                        ]}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2000}
        onClose={() => setSnackbar({ open: false, message: "" })}
        message={snackbar.message}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Drawer>
  );
}

export default EventDetailsSidebar;
