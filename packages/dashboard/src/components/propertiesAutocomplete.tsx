import { Autocomplete, SxProps, TextField, Theme } from "@mui/material";
import { useState } from "react";

export function PropertiesAutocomplete({
  disabled,
  sx,
  event,
  property: initialProperty,
  label = "Property Path",
  onPropertyChange,
}: {
  property?: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  event: string;
  label?: string;
  onPropertyChange?: (property: string) => void;
}) {
  const [property, setProperty] = useState(initialProperty);
  return (
    <Autocomplete
      value={property}
      disabled={disabled}
      freeSolo
      sx={sx}
      options={properties[event] ?? []}
      onInputChange={(_event, newProperty) => {
        if (newProperty === undefined || newProperty === null) {
          return;
        }
        setProperty(newProperty);
        onPropertyChange?.(newProperty);
      }}
      renderInput={(params) => (
        <TextField label={label} {...params} variant="outlined" />
      )}
    />
  );
}
