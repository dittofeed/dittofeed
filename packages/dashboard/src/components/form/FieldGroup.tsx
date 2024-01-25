import { Stack, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import React from "react";

import Field from "./Field";
import { FieldGroupProps } from "./types";

const FieldGroupName = styled(Typography)(({ theme }) => ({
  [theme.breakpoints.up("md")]: {
    width: "33%",
    maxWidth: "sm",
  },
}));

function FieldGroup({ name, fields, children }: FieldGroupProps) {
  return (
    <Stack direction={{ sm: "row" }}>
      <FieldGroupName mt={0.5} mb={{ sm: 0, xs: 2 }} fontWeight={500}>
        {name}
      </FieldGroupName>
      <Stack spacing={4} flex={1}>
        {fields.map((field) => (
          <Field key={field.id} {...field} />
        ))}
        {children}
      </Stack>
    </Stack>
  );
}

export default FieldGroup;
