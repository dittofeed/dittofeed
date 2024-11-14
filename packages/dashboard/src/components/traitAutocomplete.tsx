import { Autocomplete, TextField } from "@mui/material";

interface TraitAutocompleteProps {
  traitPath: string;
  traitOnChange: (newValue: string) => void;
  disabled?: boolean;
  traits: string[];
}

export default function TraitAutocomplete({
  traitPath,
  traitOnChange,
  disabled,
  traits,
}: TraitAutocompleteProps) {
  return (
    <Autocomplete
      value={traitPath}
      freeSolo
      onInputChange={(_event, newValue) => {
        traitOnChange(newValue);
      }}
      disableClearable
      options={traits}
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
