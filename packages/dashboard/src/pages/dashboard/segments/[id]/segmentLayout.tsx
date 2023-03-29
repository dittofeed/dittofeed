import Head from "next/head";

import MainLayout from "../../../../components/mainLayout";

export default function SegmentLayout({
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
      <main>
        <MainLayout>
          <>{children}</>
        </MainLayout>
      </main>
    </>
  );
}
