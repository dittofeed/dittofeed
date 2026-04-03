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
  VpnKey,
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
  FormHelperText,
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
import {
  orderedWorkspaceRoles,
  WORKSPACE_ROLE_INFO,
} from "isomorphic-lib/src/workspaceRoles";
import { enqueueSnackbar } from "notistack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useImmer } from "use-immer";

import { formatForbiddenActionNotice } from "../lib/forbiddenActionNotice";
import { noticeAnchorOrigin } from "../lib/notices";
import {
  useAdminMemberPasswordMutation,
  useCreatePermissionMutation,
  useDeletePermissionMutation,
  useUpdatePermissionMutation,
} from "../lib/usePermissionsMutations";
import { usePermissionsQuery } from "../lib/usePermissionsQuery";
import { useWorkspaceCapabilities } from "../lib/useWorkspaceCapabilities";
import { GreyButton } from "./greyButtonStyle";

interface PermissionDialogProps {
  open: boolean;
  onClose: () => void;
  memberWithRole?: WorkspaceMemberWithRoles;
  isEdit?: boolean;
  readOnly?: boolean;
}

function PermissionDialog({
  open,
  onClose,
  memberWithRole,
  isEdit = false,
  readOnly = false,
}: PermissionDialogProps) {
  const [email, setEmail] = useState(memberWithRole?.member.email ?? "");
  const [role, setRole] = useState<Role>(
    memberWithRole?.roles[0]?.role ?? RoleEnum.Viewer,
  );
  const [initialPassword, setInitialPassword] = useState("");
  const [initialPasswordConfirm, setInitialPasswordConfirm] = useState("");
  const { workspaceRoleLabel } = useWorkspaceCapabilities();

  useEffect(() => {
    if (!open) {
      return;
    }
    setEmail(memberWithRole?.member.email ?? "");
    setRole(memberWithRole?.roles[0]?.role ?? RoleEnum.Viewer);
    setInitialPassword("");
    setInitialPasswordConfirm("");
  }, [open, memberWithRole]);

  const createMutation = useCreatePermissionMutation({
    onSuccess: () => {
      enqueueSnackbar("User added successfully", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
      onClose();
      setEmail("");
      setRole(RoleEnum.Viewer);
      setInitialPassword("");
      setInitialPasswordConfirm("");
    },
    onError: (error) => {
      const forbidden = formatForbiddenActionNotice(
        error,
        "Add user",
        workspaceRoleLabel,
      );
      enqueueSnackbar(
        forbidden ??
          `Failed to add user: ${error.response?.status === 400 ? "Member already has a role" : error.message}`,
        {
          variant: "error",
          anchorOrigin: noticeAnchorOrigin,
        },
      );
    },
  });

  const updateMutation = useUpdatePermissionMutation({
    onSuccess: () => {
      enqueueSnackbar("User updated successfully", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
      onClose();
    },
    onError: (err) => {
      const forbidden = formatForbiddenActionNotice(
        err,
        "Update user role",
        workspaceRoleLabel,
      );
      enqueueSnackbar(forbidden ?? `Failed to update user: ${err.message}`, {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
  });

  const handleSubmit = () => {
    if (readOnly) {
      return;
    }
    if (isEdit && memberWithRole) {
      updateMutation.mutate({
        email: memberWithRole.member.email,
        role,
      });
      return;
    }

    const pw = initialPassword.trim();
    const pw2 = initialPasswordConfirm.trim();
    if (pw.length > 0 || pw2.length > 0) {
      if (pw !== pw2) {
        enqueueSnackbar("Passwords do not match.", {
          variant: "error",
          anchorOrigin: noticeAnchorOrigin,
        });
        return;
      }
      createMutation.mutate({
        email,
        role,
        initialPassword: pw,
      });
      return;
    }

    createMutation.mutate({
      email,
      role,
    });
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? "Edit user" : "Add User"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit || readOnly}
            fullWidth
            required
          />
          <FormControl fullWidth required>
            <InputLabel>Role</InputLabel>
            <Select
              value={role}
              label="Role"
              disabled={readOnly}
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {orderedWorkspaceRoles().map((roleKey) => {
                const info = WORKSPACE_ROLE_INFO[roleKey];
                return (
                  <MenuItem key={roleKey} value={roleKey}>
                    <Stack spacing={0.25} alignItems="flex-start">
                      <Typography variant="body2">{info.label}</Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: "normal", lineHeight: 1.3 }}
                      >
                        {info.summary}
                      </Typography>
                    </Stack>
                  </MenuItem>
                );
              })}
            </Select>
            <FormHelperText sx={{ mt: 1 }}>
              {WORKSPACE_ROLE_INFO[role].summary}
            </FormHelperText>
          </FormControl>
          {!isEdit ? (
            <>
              <TextField
                label="Initial password (optional)"
                type="password"
                value={initialPassword}
                onChange={(e) => setInitialPassword(e.target.value)}
                disabled={readOnly}
                fullWidth
                autoComplete="new-password"
                helperText="Leave blank for SSO-only; the user can set a password from My Profile."
              />
              <TextField
                label="Confirm initial password"
                type="password"
                value={initialPasswordConfirm}
                onChange={(e) => setInitialPasswordConfirm(e.target.value)}
                disabled={readOnly}
                fullWidth
                autoComplete="new-password"
              />
            </>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={readOnly || !email || isLoading}
        >
          {isEdit ? "Update" : "Add user"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface ResetPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  email: string;
}

function ResetPasswordDialog({
  open,
  onClose,
  email,
}: ResetPasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const { workspaceRoleLabel } = useWorkspaceCapabilities();

  useEffect(() => {
    if (!open) {
      return;
    }
    setNewPassword("");
    setNewPasswordConfirm("");
  }, [open, email]);

  const resetMutation = useAdminMemberPasswordMutation({
    onSuccess: () => {
      enqueueSnackbar("Password reset for user.", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
      onClose();
    },
    onError: (err) => {
      const forbidden = formatForbiddenActionNotice(
        err,
        "Reset member password",
        workspaceRoleLabel,
      );
      enqueueSnackbar(forbidden ?? `Failed to reset password: ${err.message}`, {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
  });

  const handleSubmit = () => {
    if (newPassword !== newPasswordConfirm) {
      enqueueSnackbar("Passwords do not match.", {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
      return;
    }
    resetMutation.mutate({
      email,
      newPassword,
      newPasswordConfirm,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Reset password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Set a new password for{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {email}
            </Box>
            .
          </Typography>
          <TextField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            autoComplete="new-password"
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            fullWidth
            autoComplete="new-password"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={resetMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            !newPassword || !newPasswordConfirm || resetMutation.isPending
          }
        >
          Reset password
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
      {roles.map((r) => WORKSPACE_ROLE_INFO[r.role].label).join(", ")}
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
  const onResetPassword = table.options.meta?.onResetPassword;
  const onDelete = table.options.meta?.onDelete;
  const isDeleting = table.options.meta?.isDeleting ?? false;
  const canManagePermissions =
    table.options.meta?.canManagePermissions ?? false;

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

  const handleResetPassword = () => {
    if (onResetPassword) {
      onResetPassword(memberWithRole);
    }
    handleClose();
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(memberWithRole);
    }
    handleClose();
  };

  if (!canManagePermissions) {
    return null;
  }

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
        <MenuItem onClick={handleResetPassword}>
          <VpnKey fontSize="small" sx={{ mr: 1 }} />
          Reset password
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
  const { isAdmin, workspaceRoleLabel } = useWorkspaceCapabilities();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [editingMember, setEditingMember] = useState<
    WorkspaceMemberWithRoles | undefined
  >();

  const [state, setState] = useImmer<PermissionsTableState>({
    sorting: [],
  });

  const { data: permissionsData, isLoading, error } = usePermissionsQuery();

  const deleteMutation = useDeletePermissionMutation({
    onSuccess: () => {
      enqueueSnackbar("User removed from workspace", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
    onError: (err) => {
      const forbidden = formatForbiddenActionNotice(
        err,
        "Remove user",
        workspaceRoleLabel,
      );
      enqueueSnackbar(forbidden ?? `Failed to remove user: ${err.message}`, {
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

  const handleResetPassword = useCallback(
    (memberWithRole: WorkspaceMemberWithRoles) => {
      setResetEmail(memberWithRole.member.email);
      setResetDialogOpen(true);
    },
    [],
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
    // eslint-disable-next-line react/no-unused-prop-types
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
      onResetPassword: handleResetPassword,
      onDelete: handleDelete,
      isDeleting: deleteMutation.isPending,
      canManagePermissions: isAdmin,
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
        <GreyButton
          startIcon={<Add />}
          disabled={!isAdmin}
          onClick={() => {
            setEditingMember(undefined);
            setDialogOpen(true);
          }}
        >
          Add User
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
                  <Typography variant="body2">No users found</Typography>
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
        readOnly={!isAdmin}
      />
      <ResetPasswordDialog
        open={resetDialogOpen}
        onClose={() => {
          setResetDialogOpen(false);
          setResetEmail("");
        }}
        email={resetEmail}
      />
    </Stack>
  );
}

// Add type definition for table meta
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    onEdit?: (memberWithRole: WorkspaceMemberWithRoles) => void;
    onResetPassword?: (memberWithRole: WorkspaceMemberWithRoles) => void;
    onDelete?: (memberWithRole: WorkspaceMemberWithRoles) => void;
    isDeleting?: boolean;
    canManagePermissions?: boolean;
  }
}
