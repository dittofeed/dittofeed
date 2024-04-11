import { Stack, Typography } from "@mui/material";
import React from "react";

import FieldGroup from "./FieldGroup";
import { FieldSectionProps } from "./types";

function FieldSection({ title, fieldGroups, id }: FieldSectionProps) {
  const renderedGroups = (
    <>
      {fieldGroups.map((group) => (
        <FieldGroup key={group.id} {...group} />
      ))}
    </>
  );

  return title ? (
    <Stack id={id}>
      <Typography
        variant="h3"
        sx={{
          fontSize: 16,
          fontWeight: 500,
          pt: 4,
          pb: 2,
          mb: 4,
          borderBottom: "1px solid",
          borderBottomColor: "grey.200",
        }}
      >
        {title}
      </Typography>
      <Stack>{renderedGroups}</Stack>
    </Stack>
  ) : (
    <Stack
      id={id}
      sx={{
        pb: 2,
        pt: 4,
      }}
    >
      {renderedGroups}
    </Stack>
  );
}

export default FieldSection;
