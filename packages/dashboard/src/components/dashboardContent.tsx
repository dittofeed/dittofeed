import Head from "next/head";

import MainLayout from "./mainLayout";

export default function DashboardContent({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <MainLayout>
        <>{children}</>
      </MainLayout>
    </>
  );
}
