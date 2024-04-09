import {
  Box,
  Button,
  FormControlLabel,
  FormControlLabelProps,
  Select,
  SwitchProps,
} from "@mui/material";
import React from "react";

import { SecretEditor } from "../secretEditor";
import { SelectField } from "./select";
import SimpleTextField from "./SimpleTextField";
import SimpleToggle from "./SimpleToggle";
import {
  ButtonField as ButtonFieldProps,
  FieldComponents,
  TextField as TextFieldProps,
} from "./types";

const fieldComponents = {
  text: (fieldProps: TextFieldProps["fieldProps"]) => (
    <SimpleTextField {...fieldProps} InputLabelProps={{ shrink: true }} />
  ),
  dropdown: Select,
  toggle: ({
    labelProps,
    switchProps,
  }: {
    labelProps: Omit<FormControlLabelProps, "control">;
    switchProps: SwitchProps;
  }) => (
    <FormControlLabel
      {...labelProps}
      sx={{
        fontSize: 12,
      }}
      control={<SimpleToggle {...switchProps} />}
    />
  ),
  button: (props: ButtonFieldProps["fieldProps"]) => (
    <Box display="flex" justifyContent="flex-end">
      <Button variant="contained" sx={{ justifySelf: "flex-end" }} {...props} />
    </Box>
  ),
} as const;

function Field({ type, fieldProps }: FieldComponents) {
  let field: React.ReactElement;
  switch (type) {
    case "button":
      field = <fieldComponents.button {...fieldProps} />;
      break;
    case "text":
      field = <fieldComponents.text {...fieldProps} />;
      break;
    case "toggle":
      field = <fieldComponents.toggle {...fieldProps} />;
      break;
    case "secret":
      field = <SecretEditor {...fieldProps} />;
      break;
    case "select":
      field = <SelectField {...fieldProps} />;
      break;
  }

  return field;
}

export default Field;
