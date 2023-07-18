import { Button, Stack, Typography } from "@mui/material";
import axios, { AxiosError } from "axios";
import {
  SUBSRIPTION_GROUP_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { enqueueSnackbar } from "notistack";
import { ChangeEvent, useState } from "react";

import { useAppStore } from "../../../lib/appStore";
import { noticeAnchorOrigin } from "../../../lib/notices";
import { PropsWithInitialState } from "../../../lib/types";
import getSubscriptionGroupsSSP from "../getSubscriptionGroupsSSP";
import SubscriptionGroupLayout, {
  SubscriptionGroupTabLabel,
} from "../subscriptionGroupLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  getSubscriptionGroupsSSP;

const oneMb = 1048576;

export default function SubscriptionGroupConfig() {
  const path = useRouter();
  const [file, setFile] = useState<File | null>(null);

  const workspace = useAppStore((store) => store.workspace);
  const apiBase = useAppStore((store) => store.apiBase);

  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files ? e.target.files[0] : null;
    if (uploadedFile && uploadedFile.size <= oneMb) {
      setFile(uploadedFile);
    } else {
      setFile(null);
    }
  };

  const handleSubmit = () => {
    (async () => {
      if (file && workspace.type === CompletionStatus.Successful) {
        const formData = new FormData();
        formData.append("csv", file);
        formData.append("workspaceId", workspace.value.id);
        try {
          await axios({
            url: `${apiBase}/api/subscription-groups/upload-csv`,
            method: "POST",
            data: formData,
            headers: {
              [WORKSPACE_ID_HEADER]: workspace.value.id,
              [SUBSRIPTION_GROUP_ID_HEADER]: id,
            },
          });

          enqueueSnackbar("Submitted users to subscription group", {
            variant: "success",
            autoHideDuration: 3000,
            anchorOrigin: noticeAnchorOrigin,
          });
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<ErrorResponse>;
            // Handle AxiosError

            // If the response has a data field with a message property, log it
            if (axiosError.response?.data?.message) {
              console.error(
                `Dittofeed Error: ${axiosError.response.status} ${axiosError.response.data.message}`
              );
            } else if (axiosError.response?.status) {
              console.error(`Dittofeed Error: ${axiosError.response.status}`);
            } else {
              console.error(`Dittofeed Error: ${axiosError.message}`);
            }
          } else {
            // Unknown error
            console.error(error);
          }
        }
      }
    })();
  };

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
        <Stack
          direction="row"
          sx={{ alignItems: "center", width: "100%" }}
          spacing={3}
        >
          <Button variant="contained" component="label">
            Choose CSV File
            <input
              accept=".csv"
              type="file"
              hidden
              onChange={handleFileChange}
            />
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={!file}
          >
            Upload
          </Button>
        </Stack>
        {file ? (
          <Typography sx={{ fontFamily: "monospace" }}>{file.name}</Typography>
        ) : null}
      </Stack>
    </SubscriptionGroupLayout>
  );
}
