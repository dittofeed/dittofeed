import {
  Close as CloseIcon,
  InfoOutlined as InfoIcon,
} from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import {
  CompletionStatus,
  GetUserPropertyIndicesResponse,
  UserPropertyIndexType,
} from "isomorphic-lib/src/types";
import React, { useMemo, useState } from "react";

import { useAppStorePick } from "../../lib/appStore";
import { useDeleteUserPropertyIndexMutation } from "../../lib/useDeleteUserPropertyIndexMutation";
import { useUpsertUserPropertyIndexMutation } from "../../lib/useUpsertUserPropertyIndexMutation";
import {
  USER_PROPERTY_INDICES_QUERY_KEY,
  useUserPropertyIndicesQuery,
} from "../../lib/useUserPropertyIndicesQuery";
import { useUserPropertyResourcesQuery } from "../../lib/useUserPropertyResourcesQuery";

type IndexTypeOption = UserPropertyIndexType | "None";

interface ConfigureSortIndicesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ConfigureSortIndicesDialog({
  open,
  onClose,
}: ConfigureSortIndicesDialogProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const userPropertiesQuery = useUserPropertyResourcesQuery();
  const indicesQuery = useUserPropertyIndicesQuery();
  const upsertMutation = useUpsertUserPropertyIndexMutation();
  const deleteMutation = useDeleteUserPropertyIndexMutation();

  // Track which properties have mutations in flight (for loading state)
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());

  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  // Map user property ID to its current index type
  const indexTypeMap = useMemo(() => {
    const map = new Map<string, UserPropertyIndexType>();
    if (indicesQuery.data?.indices) {
      for (const index of indicesQuery.data.indices) {
        map.set(index.userPropertyId, index.type);
      }
    }
    return map;
  }, [indicesQuery.data]);

  const handleTypeChange = (
    userPropertyId: string,
    newValue: IndexTypeOption,
  ) => {
    const currentValue = indexTypeMap.get(userPropertyId) ?? "None";

    // Don't make a change if it's the same
    if (newValue === currentValue) {
      return;
    }

    if (!workspaceId) return;

    const queryKey = [USER_PROPERTY_INDICES_QUERY_KEY, { workspaceId }];

    // Optimistically update the cache
    const optimisticUpdate = () => {
      const previousData =
        queryClient.getQueryData<GetUserPropertyIndicesResponse>(queryKey);

      queryClient.setQueryData<GetUserPropertyIndicesResponse>(
        queryKey,
        (old) => {
          if (!old) return { indices: [] };

          if (newValue === "None") {
            // Remove the index
            return {
              indices: old.indices.filter(
                (idx) => idx.userPropertyId !== userPropertyId,
              ),
            };
          }
          // Add or update the index
          const existingIdx = old.indices.findIndex(
            (idx) => idx.userPropertyId === userPropertyId,
          );
          if (existingIdx >= 0) {
            // Update existing
            const existing = old.indices[existingIdx];
            if (!existing) return old;
            const updated = [...old.indices];
            updated[existingIdx] = {
              id: existing.id,
              workspaceId: existing.workspaceId,
              userPropertyId: existing.userPropertyId,
              type: newValue,
              createdAt: existing.createdAt,
              updatedAt: Date.now(),
            };
            return { indices: updated };
          }
          // Add new
          return {
            indices: [
              ...old.indices,
              {
                id: `temp-${userPropertyId}`,
                workspaceId,
                userPropertyId,
                type: newValue,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ],
          };
        },
      );

      return previousData;
    };

    // Mark as mutating
    setMutatingIds((prev) => new Set(prev).add(userPropertyId));

    const onSettled = () => {
      setMutatingIds((prev) => {
        const next = new Set(prev);
        next.delete(userPropertyId);
        return next;
      });
    };

    if (newValue === "None") {
      const previousData = optimisticUpdate();
      deleteMutation.mutate(
        { userPropertyId },
        {
          onError: () => {
            // Rollback on error
            queryClient.setQueryData(queryKey, previousData);
          },
          onSettled,
        },
      );
    } else {
      const previousData = optimisticUpdate();
      upsertMutation.mutate(
        { userPropertyId, type: newValue },
        {
          onError: () => {
            // Rollback on error
            queryClient.setQueryData(queryKey, previousData);
          },
          onSettled,
        },
      );
    }
  };

  const userProperties = useMemo(() => {
    return userPropertiesQuery.data?.userProperties ?? [];
  }, [userPropertiesQuery.data]);

  // Only show loading on initial load, not during background refetches
  const isInitialLoading =
    userPropertiesQuery.isLoading || indicesQuery.isLoading;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6">Configure Sort Indices</Typography>
            <Tooltip title="Select which user properties can be used for sorting. Indexed properties enable efficient sorting in the Users table.">
              <InfoIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </Tooltip>
          </Stack>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {isInitialLoading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}
        {!isInitialLoading && userProperties.length === 0 && (
          <Typography color="text.secondary" py={2}>
            No user properties found. Create user properties first to enable
            sorting.
          </Typography>
        )}
        {!isInitialLoading && userProperties.length > 0 && (
          <Box>
            {/* Fixed Header */}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "60%" }}>
                    <Typography fontWeight={600}>Property</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ width: "40%" }}>
                    <Typography fontWeight={600}>Index Type</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
            </Table>
            {/* Scrollable Body */}
            <TableContainer sx={{ maxHeight: 350 }}>
              <Table size="small">
                <TableBody>
                  {userProperties.map((property) => {
                    const currentIndexType =
                      indexTypeMap.get(property.id) ?? "None";
                    const isMutating = mutatingIds.has(property.id);

                    return (
                      <TableRow key={property.id}>
                        <TableCell sx={{ width: "60%" }}>
                          <Typography>{property.name}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ width: "40%" }}>
                          <FormControl size="small" sx={{ minWidth: 120 }}>
                            <Select<IndexTypeOption>
                              value={currentIndexType}
                              onChange={(e) => {
                                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                                const value = e.target.value as IndexTypeOption;
                                handleTypeChange(property.id, value);
                              }}
                              disabled={isMutating}
                              sx={{
                                bgcolor: theme.palette.grey[100],
                                "& .MuiSelect-select": {
                                  py: 1,
                                },
                              }}
                            >
                              <MenuItem value="None">None</MenuItem>
                              <MenuItem value="String">String</MenuItem>
                              <MenuItem value="Number">Number</MenuItem>
                              <MenuItem value="Date">Date</MenuItem>
                            </Select>
                            {isMutating && (
                              <CircularProgress
                                size={16}
                                sx={{
                                  position: "absolute",
                                  right: 40,
                                  top: "50%",
                                  marginTop: "-8px",
                                }}
                              />
                            )}
                          </FormControl>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
