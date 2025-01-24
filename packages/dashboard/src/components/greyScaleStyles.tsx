export const greyTextFieldStyles = {
  "& .MuiFilledInput-root": {
    // Changes the bottom border color in its default state
    backgroundColor: "white",
    "&:before": {
      borderBottomColor: "grey.400",
    },
    // Changes the bottom border color when hovered
    "&:hover:before": {
      borderBottomColor: "grey.400",
    },
    // Changes the bottom border color when focused
    "&:after": {
      borderBottomColor: "grey.400",
    },
  },
  // Changes the label color when focused
  "& .MuiInputLabel-root.Mui-focused": {
    color: "grey.600",
  },
  // Changes the ripple effect color
  "& .MuiTouchRipple-root": {
    color: "grey.600",
  },
} as const;

export const greyMenuItemStyles = {
  "& .MuiMenuItem-root": {
    color: "grey.700",
    fontWeight: "bold",
    "&:hover": { bgcolor: "grey.300" },
    "&:active": { bgcolor: "grey.300" },
  },
  "&& .MuiMenuItem-root.Mui-selected": {
    bgcolor: "grey.300",
  },
};

export const greySelectStyles = {
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "grey.400",
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "grey.400",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "grey.400",
  },
  "& .MuiSelect-select": {
    fontWeight: "bold",
  },
};
