import { Box, Tooltip } from "@mui/material";
import { Static, Type } from "@sinclair/typebox";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import React from "react";
import { pick } from "remeda/dist/commonjs/pick";

export const RenderCellValues = Type.Object({
  value: Type.String(),
  row: Type.Object({
    id: Type.String(),
  }),
});

export type RenderCellValues = Static<typeof RenderCellValues>;

export default function renderCell(params: unknown) {
  const coerced = params as Record<string, unknown>;
  const result = schemaValidateWithErr(
    pick(coerced, ["value", "row"]),
    RenderCellValues
  );
  let renderCellContent: React.ReactNode;
  let title: string;
  if (result.isErr()) {
    renderCellContent = null;
    title = "";
  } else {
    const { value } = result.value;
    renderCellContent = value;
    title = value;
  }

  return (
    <Tooltip title={title} placement="right-start">
      <Box sx={{ fontFamily: "monospace" }}>{renderCellContent}</Box>
    </Tooltip>
  );
}
