import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  SelectProps,
  useTheme,
} from "@mui/material";

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  helperText?: string;
}

export function SelectField({
  label,
  options,
  onChange,
  helperText,
  ...rest
}: SelectFieldProps) {
  const theme = useTheme();
  const items = options.map((option) => (
    <MenuItem key={option.value} value={option.value}>
      {option.label}
    </MenuItem>
  ));
  const innerOnChange: SelectProps["onChange"] = (event) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    onChange(event.target.value as string);
  };
  return (
    <FormControl
      sx={{
        fieldset: {
          display: "none",
        },
        input: {
          height: "0.8rem",
        },
        label: {
          transform: "none !important",
          color: "inherit",
        },
        "& .MuiOutlinedInput-root": {
          marginTop: "1.5rem",
          border: "1px solid",
          borderColor: theme.palette.mode === "light" ? "#E0E3E7" : "#2D3843",
          borderRadius: "4px",
        },
        "& .MuiFormHelperText-root": {
          marginLeft: 0,
        },
      }}
    >
      <InputLabel>{label}</InputLabel>
      <Select onChange={innerOnChange} label={label} {...rest}>
        {items}
      </Select>
      <FormHelperText>{helperText}</FormHelperText>
    </FormControl>
  );
}
