import Head from "next/head";
import { useRouter } from "next/router";

import MainLayout from "../../../components/mainLayout";
import { useAppStorePick } from "../../../lib/appStore";

export default function MessageEditor() {
  const router = useRouter();
  const templateId =
    typeof router.query.id === "string" ? router.query.id : null;
  const { member } = useAppStorePick(["member"]);
  if (!templateId) {
    return null;
  }
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <>Foo</>
        </MainLayout>
      </main>
    </>
  );
}
