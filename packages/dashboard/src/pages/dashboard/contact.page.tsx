import { Box, Stack, useTheme } from "@mui/material";
import Head from "next/head";

import MainLayout from "../../components/mainLayout";

export default function Contact() {
  const theme = useTheme();
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <MainLayout>
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
            <a href="mailto:support@dittofeed.com">support@dittofeed.com</a>
            <span>, or </span>
            <a href="https://dittofeed-community.slack.com/ssb/redirect">
              join the Dittofeed Slack community
            </a>
            <span>!</span>
          </Box>
        </Stack>
      </MainLayout>
    </>
  );
}
