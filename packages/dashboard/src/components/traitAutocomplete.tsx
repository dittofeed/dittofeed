import { Autocomplete, SxProps, TextField } from "@mui/material";

import { useTraitsQuery } from "../lib/useTraitsQuery";

interface TraitAutocompleteProps {
  traitPath: string;
  traitOnChange: (newValue: string) => void;
  disabled?: boolean;
  sx?: SxProps;
}

export default function TraitAutocomplete({
  traitPath,
  traitOnChange,
  disabled,
  sx,
}: TraitAutocompleteProps) {
  const { data: traits } = useTraitsQuery();
  return (
    <Autocomplete
      value={traitPath}
      freeSolo
      sx={sx}
      onInputChange={(event, newValue, reason) => {
        if (reason === "input") {
          traitOnChange(newValue);
        }
      }}
      onChange={(event, newValue) => {
        if (newValue === null) {
          traitOnChange("");
          return;
        }

        let finalValue = newValue;
        // Format the value if it's a string containing a space
        if (typeof newValue === "string" && newValue.includes(" ")) {
          if (!newValue.startsWith('$["')) {
            finalValue = `$["${newValue}"]`;
          }
        }
        traitOnChange(finalValue);
      }}
      disableClearable
      options={traits?.traits ?? []}
      renderInput={(params) => (
        <TextField
          {...params}
          disabled={disabled}
          label="Trait"
          InputProps={{
            ...params.InputProps,
            type: "search",
          }}
        />
      )}
    />
  );
}
