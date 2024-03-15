import DeleteIcon from "@mui/icons-material/Delete";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
} from "@mui/material";
import React, { useState } from "react";

interface DeleteDialogProps {
  onConfirm: () => void;
  title: string;
  message: string;
  disabled?: boolean;
}

function DeleteDialog({
  onConfirm,
  title,
  message,
  disabled,
}: DeleteDialogProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleConfirm = () => {
    onConfirm();
    handleClose();
  };

  return (
    <>
      <IconButton
        edge="end"
        onClick={(event) => handleOpen(event)}
        disabled={disabled}
      >
        <DeleteIcon />
      </IconButton>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={(e) => {
              e.preventDefault();
              handleClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            color="primary"
            autoFocus
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default DeleteDialog;
