import { Box, Stack, Tabs } from "@mui/material";
import { GetServerSideProps } from "next";
import Head from "next/head";

import MainLayout from "../../components/mainLayout";
import TabLink from "../../components/tabLink";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

type Tab = "messages";

const TAB_INDEX: Record<Tab, number> = {
  messages: 0,
};

function AnalysisLayout({
  children,
  tab,
}: {
  tab: Tab;
  children?: React.ReactNode;
}) {
  const basePath = `/analysis`;
  const tabIndex = TAB_INDEX[tab];

  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <Stack direction="column" sx={{ width: "100%" }}>
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tabs value={tabIndex}>
                <TabLink label="Messages" href={basePath} index={0} />
              </Tabs>
            </Box>
            <Box>{children}</Box>
          </Stack>
        </MainLayout>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const { workspace } = dfContext;
    const workspaceId = workspace.id;

    return {
      props: addInitialStateToProps({
        props: {},
        serverInitialState: {},
        dfContext,
      }),
    };
  });

export default function MessagesPage() {
  return (
    <AnalysisLayout tab="messages">
      <h1>Messages</h1>
    </AnalysisLayout>
  );
}
