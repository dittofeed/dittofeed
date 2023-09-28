import {
  ButtonProps,
  FormControlLabelProps,
  SwitchProps,
  TextFieldProps,
} from "@mui/material";
import { SelectInputProps } from "@mui/material/Select/SelectInput";
import { PropsWithChildren } from "react";

type ID = string | number;

export interface Field {
  id: ID;
  type: string;
  fieldProps: object;
}

export interface TextField extends Field {
  type: "text";
  fieldProps: TextFieldProps;
}

export interface DropdownField extends Field {
  type: "dropdown";
  fieldProps: SelectInputProps;
}

export interface ToggleField extends Field {
  type: "toggle";
  fieldProps: {
    labelProps: Omit<FormControlLabelProps, "control">;
    switchProps: SwitchProps;
  };
}

export interface ButtonField extends Field {
  type: "button";
  fieldProps: ButtonProps;
}

export type FieldComponents =
  | TextField
  | DropdownField
  | ToggleField
  | ButtonField;

export type FieldGroupProps = PropsWithChildren<{
  id: ID;
  name?: string;
  description?: string;
  fields: FieldComponents[];
}>;

export type FieldSectionProps = PropsWithChildren<{
  id: ID;
  title?: string;
  fieldGroups: FieldGroupProps[];
}>;

export type FieldsProps = PropsWithChildren<{
  sections: FieldSectionProps[];
}>;
