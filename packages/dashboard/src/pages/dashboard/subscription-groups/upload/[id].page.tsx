import { Button } from "@mui/material";
import axios from "axios";
import {
  SUBSRIPTION_GROUP_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { ChangeEvent, useState } from "react";

import { PropsWithInitialState, useAppStore } from "../../../../lib/appStore";
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

  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const workspace = useAppStore((store) => store.workspace);
  const apiBase = useAppStore((store) => store.apiBase);

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
        await axios({
          url: `${apiBase}/api/subscription-groups/upload-csv`,
          method: "POST",
          data: formData,
          headers: {
            [WORKSPACE_ID_HEADER]: workspace.value.id,
            [SUBSRIPTION_GROUP_ID_HEADER]: id,
          },
        });
      }
    })();
  };

  if (!id) {
    return null;
  }

  return (
    <SubscriptionGroupLayout tab={SubscriptionGroupTabLabel.Upload} id={id}>
      <Button variant="contained" component="label">
        Choose CSV file of users
        <input accept=".csv" type="file" hidden onChange={handleFileChange} />
      </Button>
      {file ? file.name : null}
      <Button
        variant="contained"
        color="primary"
        onClick={handleSubmit}
        disabled={!file}
      >
        Upload
      </Button>
    </SubscriptionGroupLayout>
  );
}
