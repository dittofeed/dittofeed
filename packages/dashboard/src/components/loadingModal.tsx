import { LoadingButton } from "@mui/lab";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tooltip,
  IconButton,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { ForwardToInboxOutlined } from "@mui/icons-material";
export default function LoadingModal({
  dialogTitle,
  children,
  loading,
  openDisabled,
  openTitle,
  submitDisabled,
  submitTitle,
  isMinimised,
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
  isMinimised?: boolean;
  onSubmit: () => void;
  onClose?: () => void;
}) {
  const theme = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const onCloseModal = () => {
    setModalOpen(false);
    onClose?.();
  };
  return (
    <>
      {!isMinimised && (
        <Button
          onClick={() => setModalOpen(true)}
          disabled={openDisabled}
          variant="outlined"
        >
          {openTitle}
        </Button>
      )}
      {isMinimised && (
        <Tooltip title="Send Test Messages">
          <IconButton
            onClick={() => setModalOpen(true)}
            disabled={openDisabled}
          >
            <ForwardToInboxOutlined
              sx={{
                border: `2px solid ${theme.palette.grey[600]}`,
                borderRadius: "50%",
              }}
            />
          </IconButton>
        </Tooltip>
      )}

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
