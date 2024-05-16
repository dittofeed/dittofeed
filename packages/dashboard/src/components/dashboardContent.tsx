import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { WhiteLabelFeatureConfig } from "isomorphic-lib/src/types";
import Head from "next/head";
import { useMemo } from "react";

import { useAppStorePick } from "../lib/appStore";
import MainLayout from "./mainLayout";

export default function DashboardContent({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { features } = useAppStorePick(["features"]);
  const whiteLabelConfig = useMemo(() => {
    const config = features.WhiteLabel;
    if (!config) {
      return null;
    }
    return schemaValidateWithErr(config, WhiteLabelFeatureConfig).unwrapOr(
      null,
    );
  }, [features]);

  return (
    <>
      <Head>
        <title>
          {whiteLabelConfig?.title ? whiteLabelConfig.title : "Dittofeed"}
        </title>
        {whiteLabelConfig?.favicon ? (
          <link rel="icon" href={whiteLabelConfig.favicon} />
        ) : null}
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <MainLayout>
        <>{children}</>
      </MainLayout>
    </>
  );
}
