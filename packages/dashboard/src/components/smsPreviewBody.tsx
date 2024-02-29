import { Box, Stack } from "@mui/material";
import React from "react";

interface SmsPreviewBodyProps {
  body: string;
}

function SmsPreviewBody({ body }: SmsPreviewBodyProps) {
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
        padding: 1,
        overflow: "hidden",
      }}
      direction="row"
      justifyContent="center"
      alignContent="center"
    >
      <Stack
        sx={{
          height: "60rem",
          width: "24rem",
          backgroundImage:
            "url(https://storage.googleapis.com/dittofeed-public/sms-box.svg)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          backgroundPosition: "50% 0%",
          justifyContent: "start",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            width: "80%",
            marginTop: 14,
            backgroundColor: "#f7f8fa",
            border: "1px solid #ebecf2",
            padding: 1,
            borderRadius: 1,
            whiteSpace: "normal", // Ensures text wraps onto the next line
            wordWrap: "break-word", // Breaks the word at the end of the line
          }}
        >
          {body}
        </Box>
      </Stack>
    </Stack>
  );
}

export default SmsPreviewBody;
