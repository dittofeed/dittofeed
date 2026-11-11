import { LockOutlined } from "@mui/icons-material";
import { Chip, Tooltip } from "@mui/material";
import { PII_MASKED } from "isomorphic-lib/src/pii";

/**
 * Consistent visual treatment for a PII value that the viewer is not allowed
 * to unmask. The literal label matches what the server returns, so screenshots
 * and CSV exports stay unambiguous.
 */
export function PiiMaskedChip() {
  return (
    <Tooltip title="Hidden by the workspace PII policy. A workspace admin can grant the Unmask PII permission.">
      <Chip
        size="small"
        variant="outlined"
        color="warning"
        icon={<LockOutlined />}
        label={PII_MASKED}
      />
    </Tooltip>
  );
}

export function isPiiMaskedValue(value: unknown, masked?: boolean): boolean {
  return masked === true || value === PII_MASKED;
}

/**
 * True when any leaf of a parsed JSON structure is the mask placeholder. Used
 * to flag partially masked documents such as event traits.
 */
export function containsMaskedValue(value: unknown): boolean {
  if (value === PII_MASKED) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsMaskedValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      containsMaskedValue,
    );
  }
  return false;
}
