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
}

const DeleteDialog: React.FC<DeleteDialogProps> = ({
  onConfirm,
  title,
  message,
}) => {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
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
      <IconButton edge="end" onClick={handleOpen}>
        <DeleteIcon />
      </IconButton>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleConfirm} color="primary" autoFocus>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DeleteDialog;
