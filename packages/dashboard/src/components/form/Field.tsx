import {
  Box,
  Button,
  FormControlLabel,
  FormControlLabelProps,
  Select,
  SwitchProps,
} from "@mui/material"
import React from "react"

import BootstrapInput from "./BootstrapInput"
import IOSSwitch from "./IosSwitch"
import { ButtonField as ButtonFieldProps, FieldComponents, TextField as TextFieldProps } from "./types"


const fieldComponents = {
  text: (fieldProps: TextFieldProps["fieldProps"]) => (
    <BootstrapInput {...fieldProps} InputLabelProps={{ shrink: true }} />
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
      control={<IOSSwitch {...switchProps} />}
    />
  ),
  button: (props: ButtonFieldProps["fieldProps"]) => (
    <Box display="flex" justifyContent="flex-end"><Button variant="contained" sx={{ justifySelf: "flex-end" }} {...props} /></Box>
  )
} as const

function Field({ type, fieldProps }: FieldComponents) {
  const Component = fieldComponents[type]

  return <Component {...fieldProps} />
}

export default Field
