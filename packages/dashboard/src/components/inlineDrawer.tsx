import { Box, Collapse, Paper, Slide, Stack } from "@mui/material";
import React, { useCallback } from "react";
import { SwitchTransition, CSSTransition } from "react-transition-group";

/**
 * A drawer that is inline with the content of the page. Uses the mui slider
 * component to slide in the drawer. Does not reuse the mui drawer component in
 * order to avoid a backdrop. The drawer header is visible at all times, and the
 * drawer header and children are both visible when the drawer is open. It
 * slides up from the bottom of the page.
 */
export function InlineDrawer({
  open,
  header,
  children,
}: {
  open: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const renderContent = useCallback(() => {
    if (!open) {
      return header;
    }
    return (
      <>
        {header}
        <Box sx={{ flex: 1 }}>{children}</Box>
      </>
    );
  }, [header, open, children]);
  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
      <Stack
        component={Paper}
        sx={{
          position: "absolute", // Allows containing absolute elements if needed later
          overflow: "scroll", // Clip collapsing content
          bottom: 0,
          left: 0,
          width: "100%",
          zIndex: 1000,
        }}
      >
        <SwitchTransition mode="out-in">
          <CSSTransition
            key={open ? "open" : "closed"}
            addEndListener={(node, done) => {
              node.addEventListener("transitionend", done, false);
            }}
            classNames="fade"
          >
            {renderContent()}
          </CSSTransition>
        </SwitchTransition>
      </Stack>
    </Box>
  );
}
