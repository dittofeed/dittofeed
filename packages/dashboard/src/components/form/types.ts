import {
  ButtonProps,
  FormControlLabelProps,
  SwitchProps,
  TextFieldProps,
} from "@mui/material";
import { PropsWithChildren } from "react";

import { SecretEditorKeyedProps, SecretEditorPropsV2 } from "../secretEditor";
import { SelectFieldProps } from "./select";

type ID = string;

export interface Field {
  id: ID;
  type: string;
  fieldProps: object;
}

export interface TextField extends Field {
  type: "text";
  fieldProps: TextFieldProps;
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

export interface SecretField extends Field {
  type: "secret";
  fieldProps: SecretEditorKeyedProps;
}

export interface SecretV2Field extends Field {
  type: "secretV2";
  fieldProps: SecretEditorPropsV2;
}

export interface SelectField extends Field {
  type: "select";
  fieldProps: SelectFieldProps;
}

export type FieldComponents =
  | TextField
  | SecretField
  | ToggleField
  | ButtonField
  | SelectField
  | SecretV2Field;

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
  disableChildStyling?: boolean;
  sections: FieldSectionProps[];
}>;
