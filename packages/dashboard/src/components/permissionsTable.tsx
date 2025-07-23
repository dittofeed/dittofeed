import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Typography,
  Box,
  Alert,
} from "@mui/material";
import { Add, Edit } from "@mui/icons-material";
import { enqueueSnackbar } from "notistack";
import {
  Role,
  RoleEnum,
  WorkspaceMemberWithRoles,
} from "isomorphic-lib/src/types";

import { usePermissionsQuery } from "../lib/usePermissionsQuery";
import {
  useCreatePermissionMutation,
  useUpdatePermissionMutation,
  useDeletePermissionMutation,
} from "../lib/usePermissionsMutations";
import { noticeAnchorOrigin } from "../lib/notices";
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
    onError: (error) => {
      enqueueSnackbar(`Failed to update permission: ${error.message}`, {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
  });

  const handleSubmit = () => {
    if (isEdit && memberWithRole) {
      updateMutation.mutate({
        memberId: memberWithRole.member.id,
        role,
      });
    } else {
      createMutation.mutate({
        memberId: email, // For now, using email as memberId - this would need to be resolved via member lookup
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
          disabled={!email || !role || isLoading}
        >
          {isEdit ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function PermissionsTable() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<
    WorkspaceMemberWithRoles | undefined
  >();

  const { data: permissionsData, isLoading, error } = usePermissionsQuery();

  const deleteMutation = useDeletePermissionMutation({
    onSuccess: () => {
      enqueueSnackbar("Permission deleted successfully", {
        variant: "success",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
    onError: (error) => {
      enqueueSnackbar(`Failed to delete permission: ${error.message}`, {
        variant: "error",
        anchorOrigin: noticeAnchorOrigin,
      });
    },
  });

  const handleEdit = (memberWithRole: WorkspaceMemberWithRoles) => {
    setEditingMember(memberWithRole);
    setDialogOpen(true);
  };

  const handleDelete = (memberWithRole: WorkspaceMemberWithRoles) => {
    deleteMutation.mutate({
      memberId: memberWithRole.member.id,
    });
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingMember(undefined);
  };

  if (isLoading) {
    return <Typography>Loading permissions...</Typography>;
  }

  if (error) {
    return (
      <Alert severity="error">
        Failed to load permissions: {error.message}
      </Alert>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h6">Workspace Permissions</Typography>
        <GreyButton startIcon={<Add />} onClick={() => setDialogOpen(true)}>
          Add Permission
        </GreyButton>
      </Box>

      <TableContainer component={Paper}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  bgcolor: "background.paper",
                  borderBottom: "1px solid",
                  borderColor: "grey.200",
                  fontWeight: 600,
                }}
              >
                Email
              </TableCell>
              <TableCell
                sx={{
                  bgcolor: "background.paper",
                  borderBottom: "1px solid",
                  borderColor: "grey.200",
                  fontWeight: 600,
                }}
              >
                Name
              </TableCell>
              <TableCell
                sx={{
                  bgcolor: "background.paper",
                  borderBottom: "1px solid",
                  borderColor: "grey.200",
                  fontWeight: 600,
                }}
              >
                Role
              </TableCell>
              <TableCell
                sx={{
                  bgcolor: "background.paper",
                  borderBottom: "1px solid",
                  borderColor: "grey.200",
                  fontWeight: 600,
                  width: "120px",
                }}
              >
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {permissionsData?.memberRoles.map((memberWithRole) => (
              <TableRow
                key={memberWithRole.member.id}
                sx={{
                  "&:hover": {
                    bgcolor: "grey.50",
                  },
                }}
              >
                <TableCell
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "grey.100",
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
                    {memberWithRole.member.email}
                  </Typography>
                </TableCell>
                <TableCell
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "grey.100",
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {memberWithRole.member.name ||
                    memberWithRole.member.nickname ||
                    "-"}
                </TableCell>
                <TableCell
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "grey.100",
                  }}
                >
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
                    {memberWithRole.roles.map((role) => role.role).join(", ")}
                  </Box>
                </TableCell>
                <TableCell
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "grey.100",
                  }}
                >
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(memberWithRole)}
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
                      onConfirm={() => handleDelete(memberWithRole)}
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
                      disabled={deleteMutation.isPending}
                    />
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {(!permissionsData?.memberRoles ||
              permissionsData.memberRoles.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={4}
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
    </Box>
  );
}
