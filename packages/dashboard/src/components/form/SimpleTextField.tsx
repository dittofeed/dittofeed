import { TextField, TextFieldProps, useTheme } from "@mui/material";

export const TEXT_FIELD_HEIGHT = 0.8;

export default function SimpleTextField(props: TextFieldProps) {
  const theme = useTheme();
  const { sx } = props;
  return (
    <TextField
      {...props}
      InputLabelProps={{ shrink: true }}
      sx={{
        ...sx,
        fieldset: {
          display: "none",
        },
        input: {
          height: `${TEXT_FIELD_HEIGHT}rem`,
        },

        label: {
          transform: "translate(0px, -24px) !important",
          color: "inherit",
        },
        "& .MuiOutlinedInput-root": {
          border: "1px solid",
          borderColor: theme.palette.mode === "light" ? "#E0E3E7" : "#2D3843",
          borderRadius: "4px",
        },
        "& .MuiFormHelperText-root": {
          marginLeft: 0,
        },
      }}
    />
  );
}
