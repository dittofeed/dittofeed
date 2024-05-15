import { Box, Stack, useTheme } from "@mui/material";

import DashboardContent from "../components/dashboardContent";
import DiscordLink from "../components/discordLink";
import SupportEmailLink from "../components/supportEmailLink";

export default function Contact() {
  const theme = useTheme();
  return (
    <DashboardContent>
      <Stack
        direction="column"
        alignItems="center"
        justifyContent="center"
        sx={{ width: "100%", height: "100%" }}
      >
        <Box
          sx={{
            backgroundColor: "background.paper",
            border: `1px solid ${theme.palette.grey[200]}`,
            padding: 2,
            borderRadius: 1,
          }}
        >
          <p>We&apos;re a small team, and we&apos;d love to hear from you.</p>
          <p>If you have questions or feedback, feel reach out at</p>
          <SupportEmailLink />
          <span>, or </span>
          <DiscordLink>join the Dittofeed Discord community</DiscordLink>
          <span>!</span>
        </Box>
      </Stack>
    </DashboardContent>
  );
}
