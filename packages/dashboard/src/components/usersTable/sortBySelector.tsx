import {
  Settings as SettingsIcon,
  Sort as SortIcon,
} from "@mui/icons-material";
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useTheme,
} from "@mui/material";
import React, { useMemo, useState } from "react";

import { useUserPropertyIndicesQuery } from "../../lib/useUserPropertyIndicesQuery";
import { useUserPropertyResourcesQuery } from "../../lib/useUserPropertyResourcesQuery";
import { GreyButton } from "../greyButtonStyle";
import { ConfigureSortIndicesDialog } from "./configureSortIndicesDialog";

export interface SortBySelectorProps {
  sortBy: string | null;
  onSortByChange: (sortBy: string | null) => void;
}

export function SortBySelector({
  sortBy,
  onSortByChange,
}: SortBySelectorProps) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const open = Boolean(anchorEl);

  const indicesQuery = useUserPropertyIndicesQuery();
  const userPropertiesQuery = useUserPropertyResourcesQuery();

  // Map of indexed properties with their names
  const indexedProperties = useMemo(() => {
    const indices = indicesQuery.data?.indices ?? [];
    const properties = userPropertiesQuery.data?.userProperties ?? [];

    const propertyNameMap = new Map<string, string>();
    for (const prop of properties) {
      propertyNameMap.set(prop.id, prop.name);
    }

    return indices
      .map((index) => ({
        id: index.userPropertyId,
        name: propertyNameMap.get(index.userPropertyId) ?? index.userPropertyId,
        type: index.type,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [indicesQuery.data, userPropertiesQuery.data]);

  // Get current selection label
  const currentSelectionLabel = useMemo(() => {
    if (!sortBy || sortBy === "id") {
      return "User ID";
    }
    const found = indexedProperties.find((p) => p.id === sortBy);
    return found?.name ?? "User ID";
  }, [sortBy, indexedProperties]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (value: string | null) => {
    onSortByChange(value);
    handleClose();
  };

  const handleOpenDialog = () => {
    handleClose();
    setDialogOpen(true);
  };

  return (
    <>
      <GreyButton
        onClick={handleClick}
        startIcon={<SortIcon />}
        aria-controls={open ? "sort-by-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
      >
        Sort: {currentSelectionLabel}
      </GreyButton>
      <Menu
        id="sort-by-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        PaperProps={{
          sx: {
            borderRadius: 0,
            boxShadow: 4,
            minWidth: 200,
          },
        }}
      >
        <MenuItem
          selected={!sortBy || sortBy === "id"}
          onClick={() => handleSelect(null)}
          sx={{
            borderRadius: 0,
            py: 1.5,
            color: theme.palette.grey[700],
            "&:hover": {
              backgroundColor: theme.palette.grey[100],
            },
          }}
        >
          <Typography variant="body2">User ID (Default)</Typography>
        </MenuItem>

        {indexedProperties.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Box px={2} py={0.5}>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
              >
                Indexed Properties
              </Typography>
            </Box>
            {indexedProperties.map((property) => (
              <MenuItem
                key={property.id}
                selected={sortBy === property.id}
                onClick={() => handleSelect(property.id)}
                sx={{
                  borderRadius: 0,
                  py: 1.5,
                  color: theme.palette.grey[700],
                  "&:hover": {
                    backgroundColor: theme.palette.grey[100],
                  },
                }}
              >
                <ListItemText>
                  <Typography variant="body2">{property.name}</Typography>
                </ListItemText>
                <Typography variant="caption" color="text.secondary" ml={2}>
                  {property.type}
                </Typography>
              </MenuItem>
            ))}
          </>
        )}

        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={handleOpenDialog}
          sx={{
            borderRadius: 0,
            py: 1.5,
            color: theme.palette.grey[600],
            "&:hover": {
              backgroundColor: theme.palette.grey[100],
            },
          }}
        >
          <ListItemIcon>
            <SettingsIcon
              fontSize="small"
              sx={{ color: theme.palette.grey[600] }}
            />
          </ListItemIcon>
          <ListItemText>
            <Typography variant="body2">Manage Sort Keys...</Typography>
          </ListItemText>
        </MenuItem>
      </Menu>

      <ConfigureSortIndicesDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
