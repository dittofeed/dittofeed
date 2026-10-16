import { Box, Stack, Typography } from "@mui/material";
import React from "react";

interface MobilePushPreviewBodyProps {
  title?: string;
  body?: string;
  imageUrl?: string;
}

function MobilePushPreviewBody({
  title,
  body,
  imageUrl,
}: MobilePushPreviewBodyProps) {
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
        padding: 1,
        overflow: "auto",
      }}
      direction="row"
      justifyContent="center"
      alignContent="center"
    >
      <Stack
        sx={{
          width: "22rem",
          marginTop: 2,
          backgroundColor: "#f7f8fa",
          border: "1px solid #ebecf2",
          padding: 1,
          borderRadius: 1,
          whiteSpace: "normal",
          wordWrap: "break-word",
        }}
      >
        {title ? (
          <Typography variant="subtitle2" fontWeight={600}>
            {title}
          </Typography>
        ) : null}
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt=""
            sx={{ width: "100%", borderRadius: 1, my: 1 }}
          />
        ) : null}
        <Typography variant="body2">{body}</Typography>
      </Stack>
    </Stack>
  );
}

export default MobilePushPreviewBody;
