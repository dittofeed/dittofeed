import { MenuItem, Select, Stack, Typography } from "@mui/material";

import { greyMenuItemStyles, greySelectStyles } from "./greyScaleStyles";

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Parses a rows-per-page value from a URL query param. Returns undefined for
 * anything that isn't one of the supported options, so callers fall back to
 * their default page size.
 */
export function parseRowsPerPage(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  return ROWS_PER_PAGE_OPTIONS.find((option) => option === parsed);
}

export function RowsPerPageSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (rowsPerPage: number) => void;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary">
        Rows per page
      </Typography>
      <Select
        size="small"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        sx={greySelectStyles}
        MenuProps={{ sx: greyMenuItemStyles }}
        inputProps={{ "aria-label": "Rows per page" }}
      >
        {ROWS_PER_PAGE_OPTIONS.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );
}
