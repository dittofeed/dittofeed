import {
  Add as AddIcon,
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
  SxProps,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Theme,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
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
import { messageTemplatePath } from "isomorphic-lib/src/messageTemplates";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import {
  SavedUserPropertyResource,
  UserPropertyDefinitionType,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../lib/appStore";
import { useDeleteUserPropertyMutation } from "../lib/useDeleteUserPropertyMutation";
import { useUpsertUserPropertyMutation } from "../lib/useUpsertUserPropertyMutation";
import {
  USER_PROPERTIES_QUERY_KEY,
  useUserPropertiesQuery,
} from "../lib/useUserPropertiesQuery";
import { GreyButton, greyButtonStyle } from "./greyButtonStyle";
import { RelatedResourceSelect } from "./resourceTable";

export type UserPropertiesAllowedColumn =
  | "name"
  | "templatesUsedBy"
  | "lastRecomputed"
  | "updatedAt"
  | "actions";

export const DEFAULT_ALLOWED_USER_PROPERTIES_COLUMNS: UserPropertiesAllowedColumn[] =
  ["name", "templatesUsedBy", "lastRecomputed", "updatedAt", "actions"];

type Row = SavedUserPropertyResource & {
  lastRecomputed?: number;
  templatesUsedBy: {
    id: string;
    name: string;
    type: string;
  }[];
  disableDelete?: boolean;
};

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

function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.original.id;
  const isProtected = row.original.disableDelete;

  const deleteUserProperty = table.options.meta?.deleteUserProperty;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDelete = () => {
    if (!deleteUserProperty) {
      return;
    }
    deleteUserProperty(rowId);
    handleClose();
  };

  return (
    <>
      <Tooltip title="Actions">
        <IconButton aria-label="actions" onClick={handleClick} size="small">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "actions-button",
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 1,
              boxShadow: theme.shadows[2],
            },
          },
        }}
      >
        <MenuItem
          onClick={handleDelete}
          disabled={isProtected}
          sx={{ color: theme.palette.error.main }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

function NameCell({ row, getValue }: CellContext<Row, unknown>) {
  const name = getValue<string>();
  const userPropertyId = row.original.id;

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
      <Tooltip title="View User Property Details">
        <IconButton
          size="small"
          component={Link}
          href={`/user-properties/${userPropertyId}`}
        >
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function TemplatesCell({ getValue }: CellContext<Row, unknown>) {
  const templates = getValue<Row["templatesUsedBy"]>();

  if (!templates || templates.length === 0) {
    return null;
  }

  const relatedLabel = `${templates.length} ${templates.length === 1 ? "Template" : "Templates"}`;

  const relatedResources = templates.map((template) => ({
    href: messageTemplatePath({
      id: template.id,
      channel: template.type as "Email",
    }),
    name: template.name,
  }));

  return (
    <RelatedResourceSelect
      label={relatedLabel}
      relatedResources={relatedResources}
    />
  );
}

export default function UserPropertiesTable({
  sx,
  columnAllowList = DEFAULT_ALLOWED_USER_PROPERTIES_COLUMNS,
}: {
  sx?: SxProps<Theme>;
  columnAllowList?: UserPropertiesAllowedColumn[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userPropertyMessages } = useAppStorePick(["userPropertyMessages"]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [userPropertyName, setUserPropertyName] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const userPropertiesQuery = useUserPropertiesQuery();

  const userPropertiesData: Row[] = useMemo(() => {
    if (!userPropertiesQuery.data?.userProperties) {
      return [];
    }

    return userPropertiesQuery.data.userProperties.map((userProperty) => {
      const isProtected = protectedUserProperties.has(userProperty.name);
      const templates = Object.entries(
        userPropertyMessages[userProperty.id] ?? {},
      ).map(([id, template]) => ({
        ...template,
        id,
      }));

      return {
        ...userProperty,
        lastRecomputed: userProperty.lastRecomputed,
        templatesUsedBy: templates,
        disableDelete: isProtected,
      };
    });
  }, [userPropertiesQuery.data?.userProperties, userPropertyMessages]);

  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  useEffect(() => {
    if (userPropertiesQuery.isError) {
      setSnackbarMessage("Failed to load user properties.");
      setSnackbarOpen(true);
    }
  }, [userPropertiesQuery.isError]);

  const deleteUserPropertyMutation = useDeleteUserPropertyMutation({
    onSuccess: () => {
      setSnackbarMessage("User property deleted successfully!");
      setSnackbarOpen(true);
    },
    onError: () => {
      setSnackbarMessage("Failed to delete user property.");
      setSnackbarOpen(true);
    },
  });

  const createUserPropertyMutation = useUpsertUserPropertyMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [USER_PROPERTIES_QUERY_KEY],
      });
      setSnackbarMessage("User property created successfully!");
      setSnackbarOpen(true);
      setDialogOpen(false);
      setUserPropertyName("");
      router.push(`/user-properties/${data.id}`);
    },
    onError: (error) => {
      const errorMsg = error.response?.data.message ?? "API Error";
      setSnackbarMessage(`Failed to create user property: ${errorMsg}`);
      setSnackbarOpen(true);
    },
  });

  const handleCreateUserProperty = () => {
    if (userPropertyName.trim() && !createUserPropertyMutation.isPending) {
      const newUserPropertyId = uuid();
      createUserPropertyMutation.mutate({
        id: newUserPropertyId,
        name: userPropertyName.trim(),
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: userPropertyName.trim(),
        },
      });
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setUserPropertyName("");
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const columnDefinitions: Record<
      UserPropertiesAllowedColumn,
      ColumnDef<Row>
    > = {
      name: {
        id: "name",
        header: "Name",
        accessorKey: "name",
        cell: NameCell,
      },
      templatesUsedBy: {
        id: "templatesUsedBy",
        header: "Templates Used By",
        accessorKey: "templatesUsedBy",
        cell: TemplatesCell,
        enableSorting: false,
      },
      lastRecomputed: {
        id: "lastRecomputed",
        header: "Last Recomputed",
        accessorKey: "lastRecomputed",
        cell: TimeCell,
      },
      updatedAt: {
        id: "updatedAt",
        header: "Updated At",
        accessorKey: "updatedAt",
        cell: TimeCell,
      },
      actions: {
        id: "actions",
        header: "",
        size: 70,
        cell: ActionsCell,
        enableSorting: false,
      },
    };

    return columnAllowList.map((columnId) => columnDefinitions[columnId]);
  }, [columnAllowList]);

  const table = useReactTable({
    columns,
    data: userPropertiesData,
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
      deleteUserProperty: (userPropertyId: string) => {
        if (deleteUserPropertyMutation.isPending) return;
        deleteUserPropertyMutation.mutate(userPropertyId);
      },
    },
  });

  const isFetching =
    userPropertiesQuery.isFetching || userPropertiesQuery.isLoading;

  return (
    <>
      <Stack spacing={2} sx={{ width: "100%", height: "100%", ...sx }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h4">User Properties</Typography>
          <Button
            variant="contained"
            onClick={() => setDialogOpen(true)}
            startIcon={<AddIcon />}
            sx={greyButtonStyle}
          >
            New User Property
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
                          header.getSize() !== 150
                            ? header.getSize()
                            : undefined,
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
                              aria-label={`Sort by ${header.column.columnDef.header}`}
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
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!isFetching && userPropertiesData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center">
                    No user properties found.{" "}
                    <Button
                      size="small"
                      onClick={() => setDialogOpen(true)}
                      sx={greyButtonStyle}
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
      </Stack>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        TransitionProps={{ onEntered: () => nameInputRef.current?.focus() }}
      >
        <DialogTitle>Create New User Property</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="name"
            label="User Property Name"
            type="text"
            fullWidth
            variant="standard"
            value={userPropertyName}
            onChange={(e) => setUserPropertyName(e.target.value)}
            inputRef={nameInputRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateUserProperty();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleCreateUserProperty}
            disabled={
              !userPropertyName.trim() || createUserPropertyMutation.isPending
            }
          >
            {createUserPropertyMutation.isPending ? "Creating..." : "Create"}
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
    </>
  );
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    deleteUserProperty?: (userPropertyId: string) => void;
  }
}
