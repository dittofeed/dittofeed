import { Box, Stack } from "@mui/material";

const drawerTransitionDuration = 200;

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
  maxHeight,
}: {
  open: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
  maxHeight: string;
}) {
  return (
    <Stack
      sx={{
        position: "absolute", // Allows containing absolute elements if needed later
        bottom: 0,
        left: 0,
        width: "100%",
        zIndex: 1000,
        // Custom top shadow, minimizing side spread
        boxShadow: "0px -5px 6px -4px rgba(0,0,0,0.2)",
      }}
    >
      {header}
      <Box
        sx={{
          maxHeight: open ? maxHeight : 0,
          overflow: "hidden",
          transition: `height ${drawerTransitionDuration}ms ease-in-out, max-height ${drawerTransitionDuration}ms ease-in-out, opacity ${drawerTransitionDuration}ms ease-in-out`,
          opacity: open ? 1 : 0,
        }}
      >
        {children}
      </Box>
    </Stack>
  );
}
