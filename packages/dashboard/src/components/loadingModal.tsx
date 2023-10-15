import { LoadingButton } from "@mui/lab";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { useState } from "react";

export default function LoadingModal({
  dialogTitle,
  children,
  loading,
  openDisabled,
  openTitle,
  submitDisabled,
  submitTitle,
  onSubmit,
}: {
  dialogTitle?: string;
  openTitle: string;
  submitTitle?: string;
  loading?: boolean;
  children?: React.ReactNode;
  openDisabled?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        disabled={openDisabled}
        variant="outlined"
      >
        {openTitle}
      </Button>
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogTitle>{dialogTitle ?? openTitle}</DialogTitle>
        <DialogContent dividers>{children}</DialogContent>
        <DialogActions>
          <Button
            autoFocus
            onClick={() => {
              setModalOpen(false);
            }}
          >
            Cancel
          </Button>
          <LoadingButton
            loading={loading}
            disabled={submitDisabled}
            onClick={() => {
              onSubmit();
              setModalOpen(false);
            }}
          >
            {submitTitle ?? "Submit"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}
