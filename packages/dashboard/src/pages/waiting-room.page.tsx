import { Stack, Typography, useTheme } from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { getRequestContext } from "backend-lib/src/requestContext";
import { GetServerSideProps } from "next";
import Head from "next/head";

import SlackLink from "../components/slackLink";
import SupportEmailLink from "../components/supportEmailLink";
import { PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<{
    logoutUrl: string;
    oauthStartUrl: string;
  }>
> = async (ctx) => {
  const { oauthStartUrl, logoutUrl } = backendConfig();
  if (!oauthStartUrl || !logoutUrl) {
    throw new Error("oauthStartUrl or logoutUrl not set in backend config");
  }
  const rc = await getRequestContext(ctx.req.headers.authorization ?? null);
  if (rc.isOk()) {
    return {
      redirect: {
        permanent: false,
        destination: "/dashboard",
      },
    };
  }
  return {
    props: {
      logoutUrl,
      oauthStartUrl,
      serverInitialState: {},
    },
  };
};

export default function WaitingRoom() {
  const theme = useTheme();
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <Stack
          direction="column"
          alignItems="center"
          justifyContent="center"
          sx={{ width: "100%", height: "100vh" }}
        >
          <Stack
            sx={{
              backgroundColor: "background.paper",
              border: `1px solid ${theme.palette.grey[200]}`,
              padding: 2,
              borderRadius: 1,
            }}
            spacing={1}
          >
            <Typography sx={{ fontSize: "1.5rem" }}>
              Thank you for signing up for Dittofeed!
            </Typography>
            <Typography sx={{ fontSize: "1.5rem" }}>
              Get in touch and we will finish setting up your workspace.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Typography variant="subtitle1">Send us an email:</Typography>
              <SupportEmailLink />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Typography variant="subtitle1">Reach out on slack:</Typography>
              <SlackLink>Dittofeed Slack community</SlackLink>
            </Stack>
          </Stack>
        </Stack>
      </main>
    </>
  );
}
