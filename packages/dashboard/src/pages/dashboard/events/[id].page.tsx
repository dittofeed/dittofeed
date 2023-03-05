import React from "react";
import { Box, Stack, useTheme } from "@mui/material";
import Head from "next/head";

import MainLayout from "../../../components/mainLayout";

export default function Events() {
  const [paginationModel, setPaginationModel] = React.useState({
    page: 0,
    pageSize: 5,
  });

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
        ></Stack>
      </MainLayout>
    </>
  );
}
