import {
  Add as AddIcon,
  ArrowDownward,
  ArrowUpward,
  Computer,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenInNewIcon,
  UnfoldMore,
} from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  CellContext,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { AxiosError } from "axios";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  DuplicateResourceTypeEnum,
  EmailContentsType,
  MessageTemplateConfiguration,
  MessageTemplateResource,
  MinimalJourneysResource,
  ResourceTypeEnum,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../../lib/appStore";
import { useUniversalRouter } from "../../lib/authModeProvider";
import { getDefaultMessageTemplateDefinition } from "../../lib/defaultTemplateDefinition";
import {
  DeleteMessageTemplateVariables,
  useDeleteMessageTemplateMutation,
} from "../../lib/useDeleteMessageTemplateMutation";
import { useDuplicateResourceMutation } from "../../lib/useDuplicateResourceMutation";
import { useMessageTemplatesQuery } from "../../lib/useMessageTemplatesQuery";
import {
  UpsertMessageTemplateParams,
  useMessageTemplateUpdateMutation,
} from "../../lib/useMessageTemplateUpdateMutation";
import { useResourcesQuery } from "../../lib/useResourcesQuery";
import { GreyButton, greyButtonStyle } from "../greyButtonStyle";
import { RelatedResourceSelect } from "../resourceTable";

// Row type for the table
type Row = MessageTemplateResource & {
  journeysUsedBy: MinimalJourneysResource[];
};

const ROW_HEIGHT = "60px";

// TimeCell for displaying timestamps like updatedAt
// Adapted from packages/dashboard/src/pages/segments/index.page.tsx
function TimeCell({ getValue }: CellContext<Row, unknown>) {
  const timestamp = getValue<number | undefined>();
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);

  const tooltipContent = (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Computer sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            Your device
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <Home sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            UTC
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
              timeZone: "UTC",
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  const formatted = formatDistanceToNow(date, { addSuffix: true });
  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Typography variant="body2">{formatted}</Typography>
    </Tooltip>
  );
}

// Cell renderer for Actions column
function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const { id: rowId, definition } = row.original;
  const rowName = row.original.name;

  // Access functions from table meta
  const deleteMessageTemplate = table.options.meta?.deleteMessageTemplate;
  const duplicateMessageTemplate = table.options.meta?.duplicateMessageTemplate;
  const isDeleting = table.options.meta?.isDeletingTemplateId === rowId;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDuplicate = () => {
    if (!duplicateMessageTemplate) {
      console.error(
        "duplicateMessageTemplate function not found in table meta",
      );
      return;
    }
    duplicateMessageTemplate(rowName);
    handleClose();
  };

  const handleDelete = () => {
    if (!deleteMessageTemplate) {
      console.error("deleteMessageTemplate function not found in table meta");
      return;
    }
    if (!definition) {
      console.error(
        "Template definition not found, cannot determine channel type for delete.",
      );
      // Optionally show a snackbar message to the user here
      return;
    }
    deleteMessageTemplate({ id: rowId, channelType: definition.type });
    handleClose();
  };

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          aria-label="actions"
          onClick={handleClick}
          size="small"
          disabled={isDeleting || !definition} // Disable if no definition for safety
        >
          {isDeleting ? (
            <CircularProgress size={20} />
          ) : (
            <MoreVertIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{ "aria-labelledby": "actions-button" }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { borderRadius: 1, boxShadow: theme.shadows[2] } }}
      >
        <MenuItem onClick={handleDuplicate}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={handleDelete}
          sx={{ color: theme.palette.error.main }}
          disabled={isDeleting || !definition} // Disable if no definition
        >
          {isDeleting ? (
            <CircularProgress size={16} sx={{ mr: 1 }} />
          ) : (
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          )}
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

// Cell renderer for Name column
function NameCell({ row, getValue }: CellContext<Row, unknown>) {
  const name = getValue<string>();
  const universalRouter = useUniversalRouter();
  const { id: templateId, definition } = row.original;

  let channelPath = "unknown";
  if (definition) {
    switch (definition.type) {
      case ChannelType.Email:
        channelPath = "email";
        break;
      case ChannelType.Sms:
        channelPath = "sms";
        break;
      case ChannelType.MobilePush:
        channelPath = "mobilepush";
        break;
      case ChannelType.Webhook:
        channelPath = "webhook";
        break;
      default:
        assertUnreachable(definition);
    }
  }

  // Construct channel-specific route
  const href = universalRouter.mapUrl(
    `/templates/${channelPath}/${templateId}`,
  );

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{ maxWidth: "350px" }}
    >
      <Tooltip title={name} placement="bottom-start">
        <Typography
          variant="body2"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </Typography>
      </Tooltip>
      <Tooltip title="View Template Details">
        <IconButton size="small" component={Link} href={href}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

// Cell renderer for Channel column
function ChannelCell({ row }: CellContext<Row, unknown>) {
  const { definition } = row.original;
  let channelText = "Unknown";

  if (definition) {
    switch (definition.type) {
      case ChannelType.Email:
        channelText = "Email";
        break;
      case ChannelType.Sms:
        channelText = "SMS";
        break;
      case ChannelType.MobilePush:
        channelText = "Mobile Push";
        break;
      case ChannelType.Webhook:
        channelText = "Webhook";
        break;
      default:
        assertUnreachable(definition);
    }
  }
  return <Typography variant="body2">{channelText}</Typography>;
}

// Cell renderer for Journeys Used By column
// Adapted from packages/dashboard/src/pages/segments/index.page.tsx JourneysCell
function JourneysCell({ getValue }: CellContext<Row, unknown>) {
  const journeys = getValue<MinimalJourneysResource[]>();

  if (!journeys || journeys.length === 0) {
    return <Typography variant="body2">-</Typography>;
  }

  const relatedLabel = `${journeys.length} ${
    journeys.length === 1 ? "Journey" : "Journeys"
  }`;

  const relatedResources = journeys.map((journey) => ({
    href: `/journeys/${journey.id}`,
    name: journey.name,
  }));

  return (
    <RelatedResourceSelect
      label={relatedLabel}
      relatedResources={relatedResources}
    />
  );
}

export default function TemplatesTable({
  messageTemplateConfiguration,
}: {
  messageTemplateConfiguration?: Omit<MessageTemplateConfiguration, "type">;
}) {
  const universalRouter = useUniversalRouter();
  const { workspace } = useAppStorePick(["workspace"]);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  // Dialog state for creating new templates
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>(
    ChannelType.Email,
  );
  const [emailContentType, setEmailContentType] = useState<EmailContentsType>(
    EmailContentsType.LowCode,
  );
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Fetch message templates
  const messageTemplatesQuery = useMessageTemplatesQuery({
    resourceType: ResourceTypeEnum.Declarative,
  });

  // Fetch journeys to link to templates
  const { data: resources } = useResourcesQuery({
    journeys: {
      messageTemplates: true,
    },
  });

  const deleteTemplateMutation = useDeleteMessageTemplateMutation({
    onSuccess: () => {
      setSnackbarMessage("Template deleted successfully!");
      setSnackbarOpen(true);
    },
    onError: (error) => {
      const errorMsg = error.message || "Failed to delete template.";
      setSnackbarMessage(errorMsg);
      setSnackbarOpen(true);
    },
  });

  const duplicateTemplateMutation = useDuplicateResourceMutation({
    onSuccess: (data) => {
      setSnackbarMessage(`Template duplicated as "${data.name}"!`);
      setSnackbarOpen(true);
    },
    onError: (error) => {
      console.error("Failed to duplicate template:", error);
      const errorMsg =
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (error as AxiosError<{ message?: string }>).response?.data.message ??
        "API Error";
      setSnackbarMessage(`Failed to duplicate template: ${errorMsg}`);
      setSnackbarOpen(true);
    },
  });

  // Template update/create mutation
  const updateTemplateMutation = useMessageTemplateUpdateMutation();

  const templatesData: Row[] = useMemo(() => {
    if (
      !messageTemplatesQuery.data ||
      workspace.type !== CompletionStatus.Successful
    ) {
      return [];
    }

    const journeysByTemplateId = new Map<string, MinimalJourneysResource[]>();
    if (resources?.journeys) {
      for (const journey of resources.journeys) {
        // Ensure journey.id and journey.name are present
        if (journey.id && journey.name && journey.messageTemplates) {
          for (const templateId of journey.messageTemplates) {
            const existingJourneys = journeysByTemplateId.get(templateId) ?? [];
            if (!existingJourneys.find((j) => j.id === journey.id)) {
              existingJourneys.push({ id: journey.id, name: journey.name });
            }
            journeysByTemplateId.set(templateId, existingJourneys);
          }
        }
      }
    }

    return messageTemplatesQuery.data.map((template) => ({
      ...template,
      journeysUsedBy: journeysByTemplateId.get(template.id) ?? [],
    }));
  }, [messageTemplatesQuery.data, resources?.journeys, workspace]);

  const [pagination, setPagination] = useState({
    pageIndex: 0, // initial page index
    pageSize: 10, // default page size
  });

  useEffect(() => {
    if (messageTemplatesQuery.isError) {
      setSnackbarMessage("Failed to load message templates.");
      setSnackbarOpen(true);
    }
  }, [messageTemplatesQuery.isError]);

  // Handle dialog close
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setNewTemplateName("");
    setSelectedChannel(ChannelType.Email);
    setEmailContentType(EmailContentsType.LowCode);
  };

  // Handle channel change in dialog
  const handleChannelChange = (
    _: React.MouseEvent<HTMLElement>,
    newChannel: ChannelType | null,
  ) => {
    if (newChannel !== null) {
      setSelectedChannel(newChannel);
      setEmailContentType(EmailContentsType.LowCode);
    }
  };

  // Handle template creation
  const handleCreateTemplate = () => {
    if (!newTemplateName.trim() || updateTemplateMutation.isPending) {
      return;
    }

    const newTemplateId = uuid();

    // Determine the appropriate email contents type based on configuration
    let finalEmailContentType: EmailContentsType | undefined = emailContentType;
    if (
      selectedChannel === ChannelType.Email &&
      messageTemplateConfiguration?.allowedEmailContentsTypes
    ) {
      if (messageTemplateConfiguration.allowedEmailContentsTypes.length === 1) {
        [finalEmailContentType] =
          messageTemplateConfiguration.allowedEmailContentsTypes;
      }
    }

    const definition = getDefaultMessageTemplateDefinition(
      selectedChannel,
      finalEmailContentType,
      messageTemplateConfiguration?.lowCodeEmailDefaultType,
    );

    const templateData: UpsertMessageTemplateParams = {
      id: newTemplateId,
      name: newTemplateName.trim(),
      definition,
      resourceType: ResourceTypeEnum.Declarative,
    };

    updateTemplateMutation.mutate(templateData, {
      onSuccess: (data) => {
        setSnackbarMessage("Template created successfully!");
        setSnackbarOpen(true);
        handleCloseDialog();

        // Get channel path for navigation
        let channelPath = "unknown";
        switch (selectedChannel) {
          case ChannelType.Email:
            channelPath = "email";
            break;
          case ChannelType.Sms:
            channelPath = "sms";
            break;
          case ChannelType.MobilePush:
            channelPath = "mobilepush";
            break;
          case ChannelType.Webhook:
            channelPath = "webhook";
            break;
          default:
            assertUnreachable(selectedChannel);
        }

        // Navigate to channel-specific template edit page
        universalRouter.push(`/templates/${channelPath}/${data.id}`);
      },
      onError: (error) => {
        const errorMsg = error.message || "Failed to create template.";
        setSnackbarMessage(errorMsg);
        setSnackbarOpen(true);
      },
    });
  };

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: NameCell,
      },
      {
        accessorKey: "journeysUsedBy",
        header: "Journeys Used By",
        cell: JourneysCell,
        enableSorting: false,
      },
      {
        id: "channel",
        header: "Channel",
        cell: ChannelCell,
        enableSorting: true,
        accessorFn: (row) => {
          // Provide a string value for sorting
          if (row.definition) {
            switch (row.definition.type) {
              case ChannelType.Email:
                return "Email";
              case ChannelType.Sms:
                return "SMS";
              case ChannelType.MobilePush:
                return "Mobile Push";
              case ChannelType.Webhook:
                return "Webhook";
              default:
                assertUnreachable(row.definition);
                return "Unknown";
            }
          }
          return "Unknown";
        },
      },
      {
        accessorKey: "updatedAt",
        header: "Updated At",
        cell: TimeCell,
      },
      {
        id: "actions",
        header: "",
        size: 70,
        cell: ActionsCell,
        enableSorting: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: templatesData,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      pagination,
      sorting,
    },
    meta: {
      deleteMessageTemplate: (variables: DeleteMessageTemplateVariables) => {
        if (deleteTemplateMutation.isPending) return;
        deleteTemplateMutation.mutate(variables);
      },
      duplicateMessageTemplate: (templateName: string) => {
        if (duplicateTemplateMutation.isPending) return;
        duplicateTemplateMutation.mutate({
          name: templateName,
          resourceType: DuplicateResourceTypeEnum.MessageTemplate,
        });
      },
      isDeletingTemplateId: deleteTemplateMutation.isPending
        ? deleteTemplateMutation.variables.id // Access id from variables
        : null,
    },
  });

  const isFetching =
    messageTemplatesQuery.isFetching || messageTemplatesQuery.isLoading;

  if (workspace.type !== CompletionStatus.Successful) {
    // Or some other loading / error state for workspace
    return <CircularProgress />;
  }

  return (
    <Stack spacing={2} sx={{ width: "100%", height: "100%" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Message Templates</Typography>
        <Button
          variant="contained"
          onClick={() => setDialogOpen(true)}
          startIcon={<AddIcon />}
          sx={greyButtonStyle}
        >
          New Template
        </Button>
      </Stack>
      <TableContainer component={Paper}>
        <Table stickyHeader>
          <TableHead>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableCell
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      width:
                        header.getSize() !== 150 ? header.getSize() : undefined,
                    }}
                    sortDirection={header.column.getIsSorted() || false}
                  >
                    {header.isPlaceholder ? null : (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          cursor: header.column.getCanSort()
                            ? "pointer"
                            : "default",
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getCanSort() && (
                          <IconButton
                            size="small"
                            sx={{ ml: 0.5 }}
                            aria-label={`Sort by ${String(
                              header.column.columnDef.header,
                            )}`}
                          >
                            {{
                              asc: <ArrowUpward fontSize="inherit" />,
                              desc: <ArrowDownward fontSize="inherit" />,
                              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                            }[header.column.getIsSorted() as string] ?? (
                              <UnfoldMore
                                fontSize="inherit"
                                sx={{ opacity: 0.5 }}
                              />
                            )}
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHead>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                hover
                sx={{
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                  height: ROW_HEIGHT, // Apply fixed row height
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    sx={{ height: "inherit" }} // Ensure cell respects row height
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!isFetching && templatesData.length === 0 && (
              <TableRow sx={{ height: ROW_HEIGHT }}>
                <TableCell colSpan={columns.length} align="center">
                  No message templates found.
                  <Button
                    size="small"
                    onClick={() => setDialogOpen(true)}
                    sx={{ ...greyButtonStyle, ml: 1 }}
                  >
                    Create One
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter
            sx={{
              position: "sticky",
              bottom: 0,
              zIndex: 1,
            }}
          >
            <TableRow>
              <TableCell
                colSpan={table.getAllColumns().length}
                sx={{
                  bgcolor: "background.paper",
                  borderTop: (t) => `1px solid ${t.palette.divider}`,
                }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <GreyButton
                      onClick={() => table.setPageIndex(0)}
                      disabled={!table.getCanPreviousPage()}
                      startIcon={<KeyboardDoubleArrowLeft />}
                    >
                      First
                    </GreyButton>
                    <GreyButton
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      startIcon={<KeyboardArrowLeft />}
                    >
                      Previous
                    </GreyButton>
                    <GreyButton
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      endIcon={<KeyboardArrowRight />}
                    >
                      Next
                    </GreyButton>
                    <GreyButton
                      onClick={() =>
                        table.setPageIndex(table.getPageCount() - 1)
                      }
                      disabled={!table.getCanNextPage()}
                      endIcon={<KeyboardDoubleArrowRight />}
                    >
                      Last
                    </GreyButton>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box
                      sx={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        minWidth: "40px",
                        justifyContent: "center",
                      }}
                    >
                      {isFetching && (
                        <CircularProgress color="inherit" size={20} />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Page{" "}
                      <strong>
                        {table.getState().pagination.pageIndex + 1} of{" "}
                        {Math.max(1, table.getPageCount())}
                      </strong>
                    </Typography>
                  </Stack>
                </Stack>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>

      {/* Create Template Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        TransitionProps={{ onEntered: () => nameInputRef.current?.focus() }}
      >
        <DialogTitle>Create New Message Template</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="name"
            label="Template Name"
            type="text"
            fullWidth
            variant="standard"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            inputRef={nameInputRef}
            onKeyPress={(e) => {
              if (e.key === "Enter" && newTemplateName.trim()) {
                handleCreateTemplate();
              }
            }}
          />
          <Typography display="block" sx={{ mt: 2, mb: 1 }}>
            Channel Type
          </Typography>
          <ToggleButtonGroup
            value={selectedChannel}
            exclusive
            onChange={handleChannelChange}
            aria-label="channel type"
            size="small"
          >
            <ToggleButton value={ChannelType.Email} aria-label="Email">
              Email
            </ToggleButton>
            <ToggleButton value={ChannelType.Sms} aria-label="SMS">
              SMS
            </ToggleButton>
            <ToggleButton value={ChannelType.Webhook} aria-label="Webhook">
              Webhook
            </ToggleButton>
            <ToggleButton
              value={ChannelType.MobilePush}
              aria-label="Mobile Push"
            >
              Mobile Push
            </ToggleButton>
          </ToggleButtonGroup>
          {selectedChannel === ChannelType.Email &&
            (() => {
              // If allowedEmailContentsTypes is undefined, empty, or has both types, show toggle
              const shouldShowToggle =
                !messageTemplateConfiguration?.allowedEmailContentsTypes ||
                messageTemplateConfiguration.allowedEmailContentsTypes
                  .length === 0 ||
                messageTemplateConfiguration.allowedEmailContentsTypes
                  .length === 2;

              if (!shouldShowToggle) {
                return null;
              }

              return (
                <>
                  <Typography display="block" sx={{ mt: 2, mb: 1 }}>
                    Email Editor Type
                  </Typography>
                  <ToggleButtonGroup
                    value={emailContentType}
                    exclusive
                    onChange={(_, newValue) => {
                      if (newValue !== null) {
                        setEmailContentType(newValue);
                      }
                    }}
                    aria-label="email editor type"
                    size="small"
                  >
                    <ToggleButton value={EmailContentsType.LowCode}>
                      Low Code
                    </ToggleButton>
                    <ToggleButton value={EmailContentsType.Code}>
                      Code
                    </ToggleButton>
                  </ToggleButtonGroup>
                </>
              );
            })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleCreateTemplate}
            disabled={
              !newTemplateName.trim() || updateTemplateMutation.isPending
            }
          >
            {updateTemplateMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Stack>
  );
}

// Add type definition for table meta for delete and duplicate functions
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    deleteMessageTemplate?: (variables: DeleteMessageTemplateVariables) => void;
    duplicateMessageTemplate?: (templateName: string) => void;
    isDeletingTemplateId?: string | null; // To track which template is being deleted
  }
}
