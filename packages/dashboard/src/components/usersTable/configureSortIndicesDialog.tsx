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
import { UserPropertyIndexType } from "isomorphic-lib/src/types";
import React, { useMemo, useState } from "react";

import { useDeleteUserPropertyIndexMutation } from "../../lib/useDeleteUserPropertyIndexMutation";
import { useUpsertUserPropertyIndexMutation } from "../../lib/useUpsertUserPropertyIndexMutation";
import { useUserPropertyIndicesQuery } from "../../lib/useUserPropertyIndicesQuery";
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
  const userPropertiesQuery = useUserPropertyResourcesQuery();
  const indicesQuery = useUserPropertyIndicesQuery();
  const upsertMutation = useUpsertUserPropertyIndexMutation();
  const deleteMutation = useDeleteUserPropertyIndexMutation();

  const [pendingChanges, setPendingChanges] = useState<
    Record<string, IndexTypeOption>
  >({});

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

  const removePendingChange = (propertyId: string) => {
    setPendingChanges((prev) => {
      const { [propertyId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleTypeChange = (
    userPropertyId: string,
    newValue: IndexTypeOption,
  ) => {
    const currentValue = indexTypeMap.get(userPropertyId) ?? "None";

    // Don't make a change if it's the same
    if (newValue === currentValue) {
      removePendingChange(userPropertyId);
      return;
    }

    // Set pending state
    setPendingChanges((prev) => ({
      ...prev,
      [userPropertyId]: newValue,
    }));

    // Execute mutation
    if (newValue === "None") {
      deleteMutation.mutate(
        { userPropertyId },
        {
          onSettled: () => {
            removePendingChange(userPropertyId);
          },
        },
      );
    } else {
      upsertMutation.mutate(
        { userPropertyId, type: newValue },
        {
          onSettled: () => {
            removePendingChange(userPropertyId);
          },
        },
      );
    }
  };

  const userProperties = useMemo(() => {
    return userPropertiesQuery.data?.userProperties ?? [];
  }, [userPropertiesQuery.data]);

  const isLoading =
    userPropertiesQuery.isLoading ||
    indicesQuery.isLoading ||
    userPropertiesQuery.isFetching ||
    indicesQuery.isFetching;

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
        {isLoading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}
        {!isLoading && userProperties.length === 0 && (
          <Typography color="text.secondary" py={2}>
            No user properties found. Create user properties first to enable
            sorting.
          </Typography>
        )}
        {!isLoading && userProperties.length > 0 && (
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
                    const isPending = pendingChanges[property.id] !== undefined;
                    const selectValue =
                      pendingChanges[property.id] ?? currentIndexType;

                    return (
                      <TableRow key={property.id}>
                        <TableCell sx={{ width: "60%" }}>
                          <Typography>{property.name}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ width: "40%" }}>
                          <FormControl size="small" sx={{ minWidth: 120 }}>
                            <Select<IndexTypeOption>
                              value={selectValue}
                              onChange={(e) => {
                                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                                const value = e.target.value as IndexTypeOption;
                                handleTypeChange(property.id, value);
                              }}
                              disabled={isPending}
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
                            {isPending && (
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
