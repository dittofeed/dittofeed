import {
  ArrowDownward,
  ArrowUpward,
  Computer,
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
  CircularProgress,
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
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  ChannelType,
  CompletionStatus,
  MessageTemplateResource,
  MinimalJourneysResource,
  ResourceTypeEnum,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import {
  DeleteMessageTemplateVariables,
  useDeleteMessageTemplateMutation,
} from "../../lib/useDeleteMessageTemplateMutation";
import { useMessageTemplatesQuery } from "../../lib/useMessageTemplatesQuery";
import { useResourcesQuery } from "../../lib/useResourcesQuery";
import { GreyButton } from "../greyButtonStyle";
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
// Adapted from packages/dashboard/src/pages/segments/index.page.tsx
function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const { id: rowId, definition } = row.original;
  const deleteMessageTemplate = table.options.meta?.deleteMessageTemplate;
  const isDeleting = table.options.meta?.isDeletingTemplateId === rowId;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
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
  const templateId = row.original.id;
  // TODO: determine the correct href for template details page
  const href = `/templates/${templateId}`; // Placeholder Link

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
    href: `/journeys/${journey.id}`, // Assuming journey detail page path
    name: journey.name,
  }));

  return (
    <RelatedResourceSelect
      label={relatedLabel}
      relatedResources={relatedResources}
    />
  );
}

export default function TemplatesTable() {
  const theme = useTheme();
  const { workspace } = useAppStorePick(["workspace"]);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  // Fetch message templates
  const messageTemplatesQuery = useMessageTemplatesQuery({
    resourceType: ResourceTypeEnum.Declarative,
  });

  // Fetch journeys to link to templates
  const { data: resources } = useResourcesQuery({
    journeys: {
      messageTemplates: true, // User updated this
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
      isDeletingTemplateId: deleteTemplateMutation.isPending
        ? deleteTemplateMutation.variables?.id // Access id from variables
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
    <Stack spacing={2} sx={{ padding: theme.spacing(3), width: "100%" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Message Templates</Typography>
        {/* Placeholder for "New Template" button if needed */}
        {/* <Button
          variant="contained"
          // onClick={() => setDialogOpen(true)} // If a create dialog is added
          startIcon={<AddIcon />}
          sx={greyButtonStyle}
        >
          New Template
        </Button> */}
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
                  {/* Placeholder for create button in empty state */}
                  {/* <Button
                    size="small"
                    // onClick={() => setDialogOpen(true)}
                    sx={greyButtonStyle}
                  >
                    Create One
                  </Button> */}
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

// Add type definition for table meta for delete function
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    deleteMessageTemplate?: (variables: DeleteMessageTemplateVariables) => void;
    isDeletingTemplateId?: string | null; // To track which template is being deleted
  }
}
