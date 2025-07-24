import {
  Add,
  ArrowDownward as ArrowDownwardIcon,
  ArrowUpward as ArrowUpwardIcon,
  Edit,
  SwapVert as SwapVertIcon,
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
  Typography,
} from "@mui/material";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
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

interface NameCellProps {
  member: WorkspaceMemberWithRoles["member"];
}

function NameCell({ member }: NameCellProps) {
  const displayName = member.name ?? member.nickname ?? "-";
  return (
    <Box
      sx={{
        maxWidth: "200px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      <Typography>{displayName}</Typography>
    </Box>
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

interface ActionsCellProps {
  memberWithRole: WorkspaceMemberWithRoles;
  onEdit: (memberWithRole: WorkspaceMemberWithRoles) => void;
  onDelete: (memberWithRole: WorkspaceMemberWithRoles) => void;
  isDeleting: boolean;
}

function ActionsCell({
  memberWithRole,
  onEdit,
  onDelete,
  isDeleting,
}: ActionsCellProps) {
  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      <IconButton
        size="small"
        onClick={() => onEdit(memberWithRole)}
        sx={{
          color: "grey.600",
          "&:hover": {
            color: "primary.main",
            bgcolor: "primary.50",
          },
        }}
      >
        <Edit fontSize="small" />
      </IconButton>
      <DeleteDialog
        onConfirm={() => onDelete(memberWithRole)}
        title="Remove Permission"
        message={`Are you sure you want to remove ${memberWithRole.member.email}'s permissions?`}
        size="small"
        sx={{
          color: "grey.600",
          "&:hover": {
            color: "error.main",
            bgcolor: "error.50",
          },
        }}
        disabled={isDeleting}
      />
    </Box>
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

  const renderNameCell = useCallback(
    ({ row }: { row: { original: WorkspaceMemberWithRoles } }) => (
      <NameCell member={row.original.member} />
    ),
    [],
  );

  const renderRoleCell = useCallback(
    ({ row }: { row: { original: WorkspaceMemberWithRoles } }) => (
      <RoleCell roles={row.original.roles} />
    ),
    [],
  );

  const renderActionsCell = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, react/no-unused-prop-types
    ({ row }: { row: { original: WorkspaceMemberWithRoles } }) => (
      <ActionsCell
        memberWithRole={row.original}
        onEdit={handleEdit}
        onDelete={handleDelete}
        isDeleting={deleteMutation.isPending}
      />
    ),
    [handleEdit, handleDelete, deleteMutation.isPending],
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
        id: "name",
        header: "Name",
        accessorFn: (row) => row.member.name ?? row.member.nickname ?? "-",
        cell: renderNameCell,
      },
      {
        id: "role",
        header: "Role",
        accessorFn: (row) => row.roles.map((role) => role.role).join(", "),
        cell: renderRoleCell,
      },
      {
        id: "actions",
        header: "Actions",
        cell: renderActionsCell,
        enableSorting: false,
      },
    ],
    [renderEmailCell, renderNameCell, renderRoleCell, renderActionsCell],
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
                    sx={{
                      bgcolor: "background.paper",
                      borderBottom: "1px solid",
                      borderColor: "grey.200",
                      fontWeight: 600,
                      ...(header.id === "actions" && { width: "120px" }),
                    }}
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
                          <Box
                            sx={{ display: "flex", flexDirection: "column" }}
                          >
                            {(() => {
                              const sortDirection = header.column.getIsSorted();
                              if (sortDirection === "asc") {
                                return <ArrowUpwardIcon fontSize="small" />;
                              }
                              if (sortDirection === "desc") {
                                return <ArrowDownwardIcon fontSize="small" />;
                              }
                              return (
                                <SwapVertIcon
                                  fontSize="small"
                                  sx={{ color: "grey.400" }}
                                />
                              );
                            })()}
                          </Box>
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
                sx={{
                  "&:hover": {
                    bgcolor: "grey.50",
                  },
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    sx={{
                      borderBottom: "1px solid",
                      borderColor: "grey.100",
                    }}
                  >
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
