import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import { getRequestContext } from "backend-lib/src/requestContext";
import { OpenIdProfile, RequestContextErrorType } from "backend-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import Link from "next/link";

import DiscordLink from "../components/discordLink";
import SupportEmailLink from "../components/supportEmailLink";
import { PropsWithInitialState } from "../lib/types";

interface WaitingRoomProps {
  refreshUrl: string;
  emailVerified: boolean;
  signOutUrl?: string;
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<WaitingRoomProps>
> = async (ctx) => {
  const { profile } = ctx.req as { profile?: OpenIdProfile };
  const rc = await getRequestContext(ctx.req.headers, profile);
  if (rc.isOk()) {
    return {
      redirect: {
        permanent: false,
        destination: "/",
      },
    };
  }
  logger().info(rc.error, "waiting room onboarding incomplete");

  const { oauthStartUrl, signoutUrl } = backendConfig();

  const emailVerified =
    rc.error.type !== RequestContextErrorType.EmailNotVerified;

  const props: WaitingRoomProps = {
    refreshUrl: oauthStartUrl ?? "/login",
    emailVerified,
  };
  if (signoutUrl) {
    props.signOutUrl = signoutUrl;
  }
  return {
    props: {
      ...props,
      serverInitialState: {},
    },
  };
};

const WaitingRoom: NextPage<WaitingRoomProps> = function WaitingRoom({
  refreshUrl,
  emailVerified,
  signOutUrl,
}) {
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
            {!emailVerified ? (
              <Typography sx={{ fontSize: "1rem" }}>
                Please check your email to verify your email address.
              </Typography>
            ) : null}
            <Typography sx={{ fontSize: "1rem" }}>
              Get in touch and we will finish setting up your workspace. When we
              are done click the <b>Refresh</b> button.
            </Typography>
            <Box>
              <Button href={refreshUrl} LinkComponent={Link} variant="outlined">
                Refresh
              </Button>
            </Box>
            <Stack direction="row" spacing={1} sx={{ fontSize: "1rem" }}>
              <Typography variant="subtitle1">Send us an email:</Typography>
              <SupportEmailLink />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ fontSize: "1rem" }}>
              <Typography variant="subtitle1">Reach out on Discord:</Typography>
              <DiscordLink>Dittofeed Discord community</DiscordLink>
            </Stack>
            {signOutUrl ? (
              <Box>
                <Button href={signOutUrl} variant="outlined">
                  Sign Out
                </Button>
              </Box>
            ) : null}
          </Stack>
        </Stack>
      </main>
    </>
  );
};

export default WaitingRoom;
