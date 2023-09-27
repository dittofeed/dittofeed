import { alpha, InputBase, styled, TextField } from "@mui/material";

const BootstrapInput = styled(TextField)(({ theme }) => ({
  'fieldset': {
    display: 'none'
  },
  'input': {
    height: '0.8rem',
  },
  'label': {
    // fontSize: '1rem',
    transform: "none !important",
    color: "inherit"
    // position: 'relative'
  },
  '& .MuiOutlinedInput-root': {
    marginTop: '1.5rem',
    border: '1px solid',
    borderColor: theme.palette.mode === 'light' ? '#E0E3E7' : '#2D3843',
    borderRadius: "4px"
  },
  '& .MuiFormHelperText-root': {
    marginLeft: 0
  }
  // 'label + &': {
  //   marginTop: theme.spacing(3),
  // },
  // '& .MuiInputBase-input': {
  //   borderRadius: 4,
  //   position: 'relative',
  //   backgroundColor: theme.palette.mode === 'light' ? '#F3F6F9' : '#1A2027',
  //   border: '1px solid',
  //   borderColor: theme.palette.mode === 'light' ? '#E0E3E7' : '#2D3843',
  //   fontSize: 16,
  //   width: 'auto',
  //   padding: '10px 12px',
  //   transition: theme.transitions.create([
  //     'border-color',
  //     'background-color',
  //     'box-shadow',
  //   ]),
  //   // Use the system font instead of the default Roboto font.
  //   fontFamily: [
  //     '-apple-system',
  //     'BlinkMacSystemFont',
  //     '"Segoe UI"',
  //     'Roboto',
  //     '"Helvetica Neue"',
  //     'Arial',
  //     'sans-serif',
  //     '"Apple Color Emoji"',
  //     '"Segoe UI Emoji"',
  //     '"Segoe UI Symbol"',
  //   ].join(','),
  //   '&:focus': {
  //     boxShadow: `${alpha(theme.palette.primary.main, 0.25)} 0 0 0 0.2rem`,
  //     borderColor: theme.palette.primary.main,
  //   },
  // },
}));

export default BootstrapInput