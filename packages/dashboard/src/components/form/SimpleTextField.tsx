import { StyledComponent } from "@emotion/styled";
import { styled, TextField, TextFieldProps } from "@mui/material";

const SimpleTextField: StyledComponent<TextFieldProps, object, object> = styled(
  TextField
)(({ theme }) => ({
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
}));

export default SimpleTextField;
