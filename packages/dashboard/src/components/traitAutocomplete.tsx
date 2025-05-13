import { Autocomplete, TextField } from "@mui/material";

import { useTraitsQuery } from "../lib/useTraitsQuery";

interface TraitAutocompleteProps {
  traitPath: string;
  traitOnChange: (newValue: string) => void;
  disabled?: boolean;
}

export default function TraitAutocomplete({
  traitPath,
  traitOnChange,
  disabled,
}: TraitAutocompleteProps) {
  const { data: traits } = useTraitsQuery();
  return (
    <Autocomplete
      value={traitPath}
      freeSolo
      onInputChange={(_event, newValue) => {
        traitOnChange(newValue);
      }}
      disableClearable
      options={traits?.traits ?? []}
      renderInput={(params) => (
        <TextField
          {...params}
          disabled={disabled}
          label="Trait"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = event.target.value;
            traitOnChange(newValue);
          }}
          InputProps={{
            ...params.InputProps,
            type: "search",
          }}
        />
      )}
    />
  );
}
