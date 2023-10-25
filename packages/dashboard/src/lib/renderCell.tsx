import { Box, Tooltip } from "@mui/material";
import { Static, Type } from "@sinclair/typebox";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import Link from "next/link";
import React from "react";

export const RenderCellValues = Type.Object({
  value: Type.String(),
  row: Type.Object({
    id: Type.String(),
  }),
});

export type RenderCellValues = Static<typeof RenderCellValues>;

export default function renderCell(
  params: unknown,
  opts?: {
    href?: (row: RenderCellValues["row"]) => string;
  }
) {
  console.log("params", params);
  const result = schemaValidateWithErr(params, RenderCellValues);
  let renderCellContent: React.ReactNode;
  let title: string;
  if (result.isErr()) {
    renderCellContent = null;
    title = "";
  } else {
    const { value } = result.value;
    title = value;
    const innerContents = opts?.href ? (
      <Link
        href={opts.href(result.value.row)}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {value}
      </Link>
    ) : (
      value
    );
    renderCellContent = (
      <Box sx={{ fontFamily: "monospace" }}>{innerContents}</Box>
    );
  }

  return (
    <Tooltip title={title} placement="right-start">
      <Box sx={{ fontFamily: "monospace" }}>{renderCellContent}</Box>
    </Tooltip>
  );
}
