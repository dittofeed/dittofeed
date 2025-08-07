import {
  ArrowDownward as ArrowDownwardIcon,
  ArrowUpward as ArrowUpwardIcon,
  Clear as ClearIcon,
  SwapVert as SwapVertIcon,
} from "@mui/icons-material";
import { IconButton, MenuItem, Popover, Select, Stack } from "@mui/material";
import {
  SearchDeliveriesRequestSortBy,
  SearchDeliveriesRequestSortByEnum,
  SortDirection,
  SortDirectionEnum,
} from "isomorphic-lib/src/types";
import { useCallback, useState } from "react";

import { GreyButton } from "../greyButtonStyle";
import { greyMenuItemStyles, greySelectStyles } from "../greyScaleStyles";

function getSortByLabel(sortBy: SearchDeliveriesRequestSortBy): string {
  switch (sortBy) {
    case SearchDeliveriesRequestSortByEnum.sentAt:
      return "Sent At";
    case SearchDeliveriesRequestSortByEnum.from:
      return "From";
    case SearchDeliveriesRequestSortByEnum.to:
      return "To";
    case SearchDeliveriesRequestSortByEnum.status:
      return "Status";
    default:
      return sortBy;
  }
}

interface DeliveriesSortButtonProps {
  sortBy: SearchDeliveriesRequestSortBy;
  sortDirection: SortDirection;
  onSortChange: (
    sortBy: SearchDeliveriesRequestSortBy,
    sortDirection: SortDirection,
  ) => void;
}

export function DeliveriesSortButton({
  sortBy,
  sortDirection,
  onSortChange,
}: DeliveriesSortButtonProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(e.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleSortByChange = useCallback(
    (newSortBy: SearchDeliveriesRequestSortBy) => {
      onSortChange(newSortBy, sortDirection);
    },
    [onSortChange, sortDirection],
  );

  const handleSortDirectionChange = useCallback(
    (newSortDirection: SortDirection) => {
      onSortChange(sortBy, newSortDirection);
    },
    [onSortChange, sortBy],
  );

  const isDefaultSort =
    sortBy === SearchDeliveriesRequestSortByEnum.sentAt &&
    sortDirection === SortDirectionEnum.Desc;

  return (
    <>
      {!isDefaultSort && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            border: "1px solid",
            borderColor: "grey.400",
            borderRadius: 1,
            backgroundColor: "white",
            px: 1,
            height: "36px",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            {getSortByLabel(sortBy)}
            {sortDirection === SortDirectionEnum.Asc ? (
              <ArrowUpwardIcon fontSize="small" />
            ) : (
              <ArrowDownwardIcon fontSize="small" />
            )}
          </Stack>
          <IconButton
            size="small"
            onClick={() => {
              onSortChange(
                SearchDeliveriesRequestSortByEnum.sentAt,
                SortDirectionEnum.Desc,
              );
            }}
          >
            <ClearIcon />
          </IconButton>
        </Stack>
      )}
      <GreyButton
        startIcon={<SwapVertIcon />}
        sx={{
          border: "1px solid",
          borderColor: "grey.400",
          backgroundColor: "white",
        }}
        onClick={handleClick}
      >
        Sort
      </GreyButton>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        slotProps={{
          paper: {
            elevation: 3,
            sx: {
              borderRadius: 1,
              border: "1px solid",
              borderColor: "grey.400",
              p: 2,
            },
          },
        }}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="center"
          spacing={1}
        >
          <Select
            value={sortBy}
            sx={greySelectStyles}
            onChange={(e) => {
              handleSortByChange(
                e.target.value as SearchDeliveriesRequestSortBy,
              );
            }}
            MenuProps={{
              sx: greyMenuItemStyles,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
              transformOrigin: {
                vertical: "top",
                horizontal: "right",
              },
            }}
          >
            <MenuItem value={SearchDeliveriesRequestSortByEnum.sentAt}>
              {getSortByLabel(SearchDeliveriesRequestSortByEnum.sentAt)}
            </MenuItem>
            <MenuItem value={SearchDeliveriesRequestSortByEnum.from}>
              {getSortByLabel(SearchDeliveriesRequestSortByEnum.from)}
            </MenuItem>
            <MenuItem value={SearchDeliveriesRequestSortByEnum.to}>
              {getSortByLabel(SearchDeliveriesRequestSortByEnum.to)}
            </MenuItem>
            <MenuItem value={SearchDeliveriesRequestSortByEnum.status}>
              {getSortByLabel(SearchDeliveriesRequestSortByEnum.status)}
            </MenuItem>
          </Select>
          <Select
            value={sortDirection}
            sx={greySelectStyles}
            onChange={(e) => {
              handleSortDirectionChange(e.target.value as SortDirection);
            }}
            MenuProps={{
              sx: greyMenuItemStyles,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
              transformOrigin: {
                vertical: "top",
                horizontal: "right",
              },
            }}
          >
            <MenuItem value={SortDirectionEnum.Asc}>Asc</MenuItem>
            <MenuItem value={SortDirectionEnum.Desc}>Desc</MenuItem>
          </Select>
        </Stack>
      </Popover>
    </>
  );
}
