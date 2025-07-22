import { Button, ButtonProps } from "@mui/material";
import { forwardRef } from "react";

export const greyButtonStyle = {
  bgcolor: "grey.200",
  color: "grey.700",
  "&:hover": {
    bgcolor: "grey.300",
  },
  "&:active": {
    bgcolor: "grey.400",
  },
  "&.Mui-disabled": {
    bgcolor: "grey.100",
    color: "grey.400",
  },
} as const;

export const GreyButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function GreyButton(props, ref) {
    const { sx, ...rest } = props;
    return (
      <Button
        ref={ref}
        {...rest}
        sx={{
          ...greyButtonStyle,
          ...sx,
        }}
      />
    );
  }
);
