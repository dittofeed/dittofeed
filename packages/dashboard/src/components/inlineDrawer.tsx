import { Box, Stack } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

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
  placement = "overlay",
  sx,
}: {
  open: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
  maxHeight: string;
  /**
   * overlay — pinned to the bottom of a relatively positioned, height-filled parent (e.g. broadcast preview).
   * inline — sits in normal document flow directly below sibling content (e.g. segment editor + users list).
   */
  placement?: "overlay" | "inline";
  sx?: SxProps<Theme>;
}) {
  const inline = placement === "inline";
  const inlineOpenGrow =
    inline && open
      ? {
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          opacity: 1,
        }
      : null;

  const contentBox = (
    <Box
      sx={
        inlineOpenGrow
          ? {
              ...inlineOpenGrow,
              transition: `opacity ${drawerTransitionDuration}ms ease-in-out`,
            }
          : {
              maxHeight: open ? maxHeight : 0,
              overflow: "hidden",
              transition: `height ${drawerTransitionDuration}ms ease-in-out, max-height ${drawerTransitionDuration}ms ease-in-out, opacity ${drawerTransitionDuration}ms ease-in-out`,
              opacity: open ? 1 : 0,
            }
      }
    >
      {children}
    </Box>
  );

  return (
    <Stack
      sx={{
        position: inline ? "relative" : "absolute",
        ...(inline
          ? {
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              // Keep the header on the bottom edge; content grows above it so open/close does not jump the bar.
              justifyContent: "flex-end",
            }
          : {
              bottom: 0,
              left: 0,
              zIndex: 1000,
            }),
        width: "100%",
        // Custom top shadow, minimizing side spread
        boxShadow: "0px -5px 6px -4px rgba(0,0,0,0.2)",
        ...sx,
      }}
    >
      {inline ? (
        <>
          {contentBox}
          <Box sx={{ flexShrink: 0 }}>{header}</Box>
        </>
      ) : (
        <>
          {header}
          {contentBox}
        </>
      )}
    </Stack>
  );
}
