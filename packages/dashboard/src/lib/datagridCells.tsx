import { Box, Tooltip } from "@mui/material";
import { Static, Type } from "@sinclair/typebox";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import Link from "next/link";
import React from "react";
import { pick } from "remeda";

export const RenderCellValues = Type.Object({
  value: Type.String(),
  row: Type.Object({
    id: Type.String(),
  }),
});

export type RenderCellValues = Static<typeof RenderCellValues>;

export function monospaceCell(params: unknown) {
  const coerced = params as Record<string, unknown>;
  const result = schemaValidateWithErr(
    pick(coerced, ["value", "row"]),
    RenderCellValues,
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
export function LinkCell({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Tooltip title={title}>
      <Link
        style={{
          width: "100%",
          textDecoration: "none",
          color: "inherit",
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        href={href}
      >
        {children ?? title}
      </Link>
    </Tooltip>
  );
}
