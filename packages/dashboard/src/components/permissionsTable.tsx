import {
  Add,
  ArrowDownward,
  ArrowUpward,
  Computer,
  Delete as DeleteIcon,
  Edit,
  Home,
  MoreVert as MoreVertIcon,
  UnfoldMore,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  CellContext,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import {
  Role,
  RoleEnum,
  WorkspaceMemberWithRoles,
} from "isomorphic-lib/src/types";
import { enqueueSnackbar } from "notistack";
import { useCallback, useMemo, useState } from "react";
import { useImmer } from "use-immer";

import { noticeAnchorOrigin } from "../lib/notices";
import {
  useCreatePermissionMutation,
  useDeletePermissionMutation,
  useUpdatePermissionMutation,
} from "../lib/usePermissionsMutations";
import { usePermissionsQuery } from "../lib/usePermissionsQuery";
import DeleteDialog from "./confirmDeleteDialog";
import { GreyButton } from "./greyButtonStyle";

interface PermissionDialogProps {
  open: boolean;
  onClose: () => void;
  memberWithRole?: WorkspaceMemberWithRoles;
  isEdit?: boolean;
}

function PermissionDialog({
  open,
  onClose,
  memberWithRole,
  isEdit = false,
}: PermissionDialogProps) {
  const [email, setEmail] = useState(memberWithRole?.member.email || "");
  const [role, setRole] = useState<Role>(
    memberWithRole?.roles[0]?.role || RoleEnum.Admin,
  );

  const createMutation = useCreatePermissionMutation({
    onSuccess: () => {
      enqueueSnackbar("Permission created successfully", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
      onClose();
      setEmail("");
      setRole(RoleEnum.Admin);
    },
    onError: (error) => {
      enqueueSnackbar(
        `Failed to create permission: ${error.response?.status === 400 ? "Member already has a role" : error.message}`,
        {
          variant: "error",
          anchorOrigin: noticeAnchorOrigin,
        },
      );
    },
  });

  const updateMutation = useUpdatePermissionMutation({
    onSuccess: () => {
      enqueueSnackbar("Permission updated successfully", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
      onClose();
    },
    onError: (err) => {
      enqueueSnackbar(`Failed to update permission: ${err.message}`, {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
  });

  const handleSubmit = () => {
    if (isEdit && memberWithRole) {
      updateMutation.mutate({
        email: memberWithRole.member.email,
        role,
      });
    } else {
      createMutation.mutate({
        email,
        role,
      });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? "Edit Permission" : "Add Permission"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            fullWidth
            required
          />
          <FormControl fullWidth required>
            <InputLabel>Role</InputLabel>
            <Select
              value={role}
              label="Role"
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <MenuItem value={RoleEnum.Admin}>Admin</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!email || isLoading}
        >
          {isEdit ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface PermissionsTableState {
  sorting: SortingState;
}

interface EmailCellProps {
  value: string;
}

function EmailCell({ value }: EmailCellProps) {
  return (
    <Box
      sx={{
        maxWidth: "250px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      <Typography
        sx={{
          fontFamily: "monospace",
          fontSize: "0.875rem",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function TimeCell({
  getValue,
}: CellContext<WorkspaceMemberWithRoles, unknown>) {
  const timestamp = getValue<string | undefined>();
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

interface RoleCellProps {
  roles: WorkspaceMemberWithRoles["roles"];
}

function RoleCell({ roles }: RoleCellProps) {
  return (
    <Box
      sx={{
        bgcolor: "primary.50",
        color: "primary.800",
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        fontSize: "0.75rem",
        fontWeight: 500,
        display: "inline-block",
      }}
    >
      {roles.map((role) => role.role).join(", ")}
    </Box>
  );
}

function ActionsCell({
  row,
  table,
}: CellContext<WorkspaceMemberWithRoles, unknown>) {
  const theme = useTheme();
  const memberWithRole = row.original;

  const onEdit = table.options.meta?.onEdit;
  const onDelete = table.options.meta?.onDelete;
  const isDeleting = table.options.meta?.isDeleting ?? false;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(memberWithRole);
    }
    handleClose();
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(memberWithRole);
    }
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
        PaperProps={{
          sx: {
            borderRadius: 1,
            boxShadow: theme.shadows[2],
          },
        }}
      >
        <MenuItem onClick={handleEdit}>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem
          onClick={handleDelete}
          disabled={isDeleting}
          sx={{ color: theme.palette.error.main }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

export function PermissionsTable() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<
    WorkspaceMemberWithRoles | undefined
  >();

  const [state, setState] = useImmer<PermissionsTableState>({
    sorting: [],
  });

  const { data: permissionsData, isLoading, error } = usePermissionsQuery();

  const deleteMutation = useDeletePermissionMutation({
    onSuccess: () => {
      enqueueSnackbar("Permission deleted successfully", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
    onError: (err) => {
      enqueueSnackbar(`Failed to delete permission: ${err.message}`, {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
  });

  const handleEdit = useCallback((memberWithRole: WorkspaceMemberWithRoles) => {
    setEditingMember(memberWithRole);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    (memberWithRole: WorkspaceMemberWithRoles) => {
      deleteMutation.mutate({
        email: memberWithRole.member.email,
      });
    },
    [deleteMutation],
  );

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingMember(undefined);
  }, []);

  const renderEmailCell = useCallback(
    ({ row }: { row: { original: WorkspaceMemberWithRoles } }) => (
      <EmailCell value={row.original.member.email} />
    ),
    [],
  );

  const renderRoleCell = useCallback(
    ({ row }: { row: { original: WorkspaceMemberWithRoles } }) => (
      <RoleCell roles={row.original.roles} />
    ),
    [],
  );

  const data = useMemo(() => {
    return permissionsData?.memberRoles ?? [];
  }, [permissionsData]);

  const columns = useMemo<ColumnDef<WorkspaceMemberWithRoles>[]>(
    () => [
      {
        id: "email",
        header: "Email",
        accessorKey: "member.email",
        cell: renderEmailCell,
      },
      {
        id: "role",
        header: "Role",
        accessorFn: (row) => row.roles.map((role) => role.role).join(", "),
        cell: renderRoleCell,
      },
      {
        id: "createdAt",
        header: "Created At",
        accessorKey: "member.createdAt",
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
    [renderEmailCell, renderRoleCell],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: state.sorting,
    },
    onSortingChange: (updater) => {
      setState((draft) => {
        draft.sorting =
          typeof updater === "function" ? updater(draft.sorting) : updater;
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      onEdit: handleEdit,
      onDelete: handleDelete,
      isDeleting: deleteMutation.isPending,
    },
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        Failed to load permissions: {error.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        sx={{ height: "48px" }}
      >
        <Typography variant="h6">Workspace Permissions</Typography>
        <GreyButton startIcon={<Add />} onClick={() => setDialogOpen(true)}>
          Add Permission
        </GreyButton>
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  align="center"
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "grey.100",
                    py: 4,
                    color: "text.secondary",
                  }}
                >
                  <Typography variant="body2">No permissions found</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <PermissionDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        memberWithRole={editingMember}
        isEdit={!!editingMember}
      />
    </Stack>
  );
}

// Add type definition for table meta
declare module "@tanstack/react-table" {
  interface TableMeta<TData = unknown> {
    onEdit?: (memberWithRole: WorkspaceMemberWithRoles) => void;
    onDelete?: (memberWithRole: WorkspaceMemberWithRoles) => void;
    isDeleting?: boolean;
  }
}
