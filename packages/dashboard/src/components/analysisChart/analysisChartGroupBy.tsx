import {
  FormControl,
  MenuItem,
  Select,
  SxProps,
  Theme,
  Typography,
} from "@mui/material";
import { useCallback } from "react";

import { greyMenuItemStyles, greySelectStyles } from "../greyScaleStyles";

export type GroupByOption = 
  | "journey"
  | "broadcast" 
  | "channel"
  | "provider"
  | "messageState"
  | "template"
  | null;

const groupByLabels: Record<NonNullable<GroupByOption>, string> = {
  journey: "Journey",
  broadcast: "Broadcast",
  channel: "Channel", 
  provider: "Provider",
  messageState: "Message Status",
  template: "Template",
};

const groupByOptions: { value: GroupByOption; label: string }[] = [
  { value: null, label: "None" },
  { value: "journey", label: groupByLabels.journey },
  { value: "broadcast", label: groupByLabels.broadcast },
  { value: "channel", label: groupByLabels.channel },
  { value: "provider", label: groupByLabels.provider },
  { value: "messageState", label: groupByLabels.messageState },
  { value: "template", label: groupByLabels.template },
];

interface AnalysisChartGroupByProps {
  value: GroupByOption;
  onChange: (value: GroupByOption) => void;
  sx?: SxProps<Theme>;
  greyScale?: boolean;
}

export function AnalysisChartGroupBy({
  value,
  onChange,
  sx,
  greyScale = false,
}: AnalysisChartGroupByProps) {
  const handleChange = useCallback(
    (event: { target: { value: string } }) => {
      const newValue = event.target.value === "null" ? null : (event.target.value as GroupByOption);
      onChange(newValue);
    },
    [onChange],
  );

  return (
    <FormControl size="small" sx={sx}>
      <Typography variant="body2" sx={{ mb: 0.5, fontWeight: "medium" }}>
        Group By
      </Typography>
      <Select
        value={value || "null"}
        onChange={handleChange}
        MenuProps={{
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "left",
          },
          transformOrigin: {
            vertical: "top",
            horizontal: "left",
          },
          sx: greyScale ? greyMenuItemStyles : undefined,
        }}
        sx={greyScale ? greySelectStyles : undefined}
      >
        {groupByOptions.map((option) => (
          <MenuItem
            key={option.value || "null"}
            value={option.value || "null"}
          >
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}