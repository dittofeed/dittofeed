import { DownloadForOffline } from "@mui/icons-material";
import { Tooltip } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { omit } from "remeda";

import { useDownloadDeliveriesMutation } from "../../lib/useDownloadDeliveriesMutation";
import { GreyButton } from "../greyButtonStyle";

interface DeliveriesDownloadButtonProps {
  resolvedQueryParams: Record<string, any> | null;
}

export function DeliveriesDownloadButton({
  resolvedQueryParams,
}: DeliveriesDownloadButtonProps) {
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const downloadMutation = useDownloadDeliveriesMutation({
    onSuccess: () => {
      setSnackbarMessage("Downloaded deliveries CSV.");
      setSnackbarOpen(true);
    },
    onError: (error) => {
      setSnackbarMessage(`Download failed: ${error.message}`);
      setSnackbarOpen(true);
    },
  });

  const downloadParams = useMemo(() => {
    if (!resolvedQueryParams) return null;
    return omit(resolvedQueryParams, ["cursor", "limit"]);
  }, [resolvedQueryParams]);

  const handleDownload = useCallback(() => {
    if (downloadParams) {
      downloadMutation.mutate(downloadParams);
    }
  }, [downloadParams, downloadMutation]);

  return (
    <Tooltip title="Download deliveries as CSV" placement="bottom-start">
      <GreyButton
        onClick={handleDownload}
        startIcon={<DownloadForOffline />}
        disabled={!downloadParams}
      >
        Download Deliveries
      </GreyButton>
    </Tooltip>
  );
}