import { Stack } from "@mui/material";
import React from "react";

import FieldSection from "./FieldSection";
import { FieldsProps } from "./types";
import { useThemeMode } from "../../themeCustomization/ThemeContext";

function Fields({ sections, children, disableChildStyling }: FieldsProps) {
 
  const { envTheme, mode } = useThemeMode();
  
  return (
    <Stack
      sx={{
        //backgroundColor: mode === "light" ? "white" : "",
        borderRadius: 3,
        px: 4,
        py: 2,
        marginTop: 4,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "grey.200",
      }}
    >
      {sections.map((section) => (
        <FieldSection key={section.id} {...section} />
      ))}
      {children && !disableChildStyling ? (
        <Stack
          sx={{
            borderTopWidth: "1px",
            borderTopStyle: "solid",
            borderTopColor: "grey.200",
            pt: 2,
            mt: 4,
            display: "flex",
            justifyContent: "end",
          }}
        >
          {children}
        </Stack>
      ) : null}
      {children && disableChildStyling ? children : null}
    </Stack>
  );
}

export default Fields;
