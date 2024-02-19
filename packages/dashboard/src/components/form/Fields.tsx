import { Stack } from "@mui/material";
import React from "react";

import FieldSection from "./FieldSection";
import { FieldsProps } from "./types";

function Fields({ sections, children, disableDivider }: FieldsProps) {
  return (
    <Stack
      sx={{
        backgroundColor: "white",
        borderRadius: 3,
        px: 4,
        py: 2,
        marginTop: 4,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "grey.200",
      }}
    >
      {sections?.map((section) => (
        <FieldSection key={section.id} {...section} />
      ))}
      {children ? (
        <Stack
          sx={{
            pt: 2,
            display: "flex",
            justifyContent: "end",
            ...(!disableDivider && {
              borderTopWidth: "1px",
              borderTopStyle: "solid",
              borderTopColor: "grey.200",
              mt: 4,
            })
          }}
        >
          {children}
        </Stack>
      ) : null}
    </Stack>
  );
}

export default Fields;
