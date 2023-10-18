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
  onClose,
}: {
  dialogTitle?: string;
  openTitle: string;
  submitTitle?: string;
  loading?: boolean;
  children?: React.ReactNode;
  openDisabled?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const onCloseModal = () => {
    setModalOpen(false);
    onClose?.();
  };
  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        disabled={openDisabled}
        variant="outlined"
      >
        {openTitle}
      </Button>
      <Dialog open={modalOpen} onClose={onCloseModal}>
        <DialogTitle>{dialogTitle ?? openTitle}</DialogTitle>
        {children && <DialogContent dividers>{children}</DialogContent>}
        <DialogActions>
          <Button autoFocus onClick={onCloseModal}>
            Cancel
          </Button>
          <LoadingButton
            loading={loading}
            disabled={submitDisabled}
            onClick={() => {
              onSubmit();
            }}
          >
            {submitTitle ?? "Submit"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}
