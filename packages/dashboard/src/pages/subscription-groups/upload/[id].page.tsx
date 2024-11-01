import { Stack, Typography } from "@mui/material";
import axios from "axios";
import {
  SUBSRIPTION_GROUP_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useCallback } from "react";

import { CsvUploader } from "../../../components/csvUploader";
import { useAppStorePick } from "../../../lib/appStore";
import { PropsWithInitialState } from "../../../lib/types";
import getSubscriptionGroupsSSP from "../getSubscriptionGroupsSSP";
import SubscriptionGroupLayout, {
  SubscriptionGroupTabLabel,
} from "../subscriptionGroupLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  getSubscriptionGroupsSSP;

export default function SubscriptionGroupConfig() {
  const path = useRouter();
  const { workspace, apiBase } = useAppStorePick(["workspace", "apiBase"]);

  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const handleSubmit = useCallback(
    async ({ data }: { data: FormData }) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      await axios({
        url: `${apiBase}/api/subscription-groups/upload-csv`,
        method: "POST",
        data,
        headers: {
          [WORKSPACE_ID_HEADER]: workspace.value.id,
          [SUBSRIPTION_GROUP_ID_HEADER]: id,
        },
      });
    },
    [apiBase, workspace, id],
  );

  if (!id) {
    return null;
  }

  return (
    <SubscriptionGroupLayout tab={SubscriptionGroupTabLabel.Upload} id={id}>
      <Stack
        direction="column"
        sx={{ width: "100%", height: "100%", padding: 2, alignItems: "start" }}
        spacing={3}
      >
        <Stack direction="row" sx={{ alignItems: "center", width: "100%" }}>
          <Typography variant="h4">
            Upload Users to a Subscription Group
          </Typography>
        </Stack>
        <CsvUploader
          submit={handleSubmit}
          successMessage="Submitted users to subscription group"
          errorMessage="API Error: failed upload users to subscription group."
        />
      </Stack>
    </SubscriptionGroupLayout>
  );
}
