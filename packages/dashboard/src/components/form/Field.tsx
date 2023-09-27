import {
  Box,
  Button,
  FormControlLabel,
  FormControlLabelProps,
  Select,
  SwitchProps,
} from "@mui/material"
import React from "react"

import SimpleTextField from "./SimpleTextField"
import SimpleToggle from "./SimpleToggle"
import { ButtonField as ButtonFieldProps, FieldComponents, TextField as TextFieldProps } from "./types"


const fieldComponents = {
  text: (fieldProps: TextFieldProps["fieldProps"]) => (
    <SimpleTextField {...fieldProps} InputLabelProps={{ shrink: true }} />
  ),
  dropdown: Select,
  toggle: ({
    labelProps,
    switchProps,
  }: {
    labelProps: Omit<FormControlLabelProps, "control">
    switchProps: SwitchProps
  }) => (
    <FormControlLabel
      {...labelProps}
      sx={{
        fontSize: 12
      }}
      control={<SimpleToggle {...switchProps} />}
    />
  ),
  button: (props: ButtonFieldProps["fieldProps"]) => (
    <Box display="flex" justifyContent="flex-end"><Button variant="contained" sx={{ justifySelf: "flex-end" }} {...props} /></Box>
  )
} as const

function Field({ type, fieldProps }: FieldComponents) {
  if (type === "button") {
    return <fieldComponents.button {...fieldProps} />
  }
  if (type === "text") {
    return <fieldComponents.text {...fieldProps} />
  }
  if (type === "toggle") {
    return <fieldComponents.toggle {...fieldProps} />
  }

  return null
}

export default Field
