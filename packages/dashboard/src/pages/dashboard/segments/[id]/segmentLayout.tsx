import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Head from "next/head";
import Link from "next/link";

import MainLayout from "../../../../components/mainLayout";

function TabLink({
  href,
  label,
  index,
}: {
  href: string;
  label: string;
  index: number;
}) {
  return (
    <Link href={href} passHref>
      <Tab label={label} tabIndex={index} />
    </Link>
  );
}

export default function SegmentLayout({
  children,
  segmentId,
  tab,
}: {
  segmentId: string;
  tab: "configure" | "users";
  children?: React.ReactNode;
}) {
  const basePath = `/dashboard/segments/${segmentId}`;
  const tabValue = tab === "configure" ? 0 : 1;

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
              <Tabs value={tabValue}>
                <TabLink label="Configure" href={basePath} index={0} />
                <TabLink label="Users" href={`${basePath}/users`} index={1} />
              </Tabs>
            </Box>
            <Box>{children}</Box>
          </Stack>
        </MainLayout>
      </main>
    </>
  );
}
