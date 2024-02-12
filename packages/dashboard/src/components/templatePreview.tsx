import { Box, FormLabel, Stack, styled } from "@mui/material";
import React from "react";

interface TemplatePreviewProps {
  previewHeader: React.ReactNode;
  previewBody: React.ReactNode;
  visibilityHandler: React.ReactNode;
  bodyPreviewHeading: string;
}

const BodyBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== "direction",
})<{ direction: "left" | "right" } & React.ComponentProps<typeof Box>>(
  ({ theme, direction }) => ({
    flex: 1,
    flexBasis: 0,
    overflow: "scroll",
    border: `1px solid ${theme.palette.grey[200]}`,
    ...(direction === "left"
      ? {
          borderTopLeftRadius: theme.shape.borderRadius * 1,
          borderBottomLeftRadius: theme.shape.borderRadius * 1,
        }
      : {
          borderTopRightRadius: theme.shape.borderRadius * 1,
          borderBottomRightRadius: theme.shape.borderRadius * 1,
        }),
  }),
);

function TemplatePreview({
  previewHeader,
  previewBody,
  visibilityHandler,
  bodyPreviewHeading,
}: TemplatePreviewProps) {
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100vh",
      }}
      spacing={1}
    >
      <Stack>{previewHeader}</Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <FormLabel sx={{ paddingLeft: 1 }}>{bodyPreviewHeading}</FormLabel>
        {visibilityHandler}
      </Stack>
      <BodyBox direction="right">{previewBody}</BodyBox>
    </Stack>
  );
}

export default TemplatePreview;
