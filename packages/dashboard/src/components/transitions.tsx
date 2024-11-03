// material-ui
import { Box, Fade, Grow } from "@mui/material";
import { ComponentProps, forwardRef } from "react";

// ==============================|| TRANSITIONS ||============================== //

const Transitions = forwardRef(
  (
    {
      children,
      position = "top-left",
      type = "grow",
      ...others
    }: Omit<ComponentProps<typeof Fade>, "children"> & {
      children?: React.ReactElement | null;
      type?: "grow" | "fade" | "collapse" | "slide" | "zoom";
      position?:
        | "top-left"
        | "top-right"
        | "top"
        | "bottom-left"
        | "bottom-right"
        | "bottom";
    },
    ref,
  ) => {
    let positionSX = {
      transformOrigin: "0 0 0",
    };

    switch (position) {
      case "top-right":
      case "top":
      case "bottom-left":
      case "bottom-right":
      case "bottom":
      case "top-left":
      default:
        positionSX = {
          transformOrigin: "0 0 0",
        };
        break;
    }

    return (
      <Box ref={ref}>
        {type === "grow" && (
          <Grow {...others}>
            <Box sx={positionSX}>{children}</Box>
          </Grow>
        )}
        {type === "fade" && (
          <Fade
            {...others}
            timeout={{
              appear: 0,
              enter: 300,
              exit: 150,
            }}
          >
            <Box sx={positionSX}>{children}</Box>
          </Fade>
        )}
      </Box>
    );
  },
);

Transitions.displayName = "Transitions";

export default Transitions;
