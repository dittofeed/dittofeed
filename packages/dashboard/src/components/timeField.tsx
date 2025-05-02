import { Box } from "@mui/material";
import {
  TimeField as AriaTimeField,
  TimeFieldProps,
  TimeValue,
} from "react-aria-components";

export function TimeField<T extends TimeValue>(props: TimeFieldProps<T>) {
  return (
    <Box className="react-aria">
      <AriaTimeField {...props} />
    </Box>
  );
}
