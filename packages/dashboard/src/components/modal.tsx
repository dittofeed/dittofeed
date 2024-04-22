import React from "react";
import { Modal, Box, Typography, Button } from "@mui/material";

 interface ModalProps<Data> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  data: Data[];
  onClick: () => void;
  renderContent: (item: Data, index: number) => React.ReactNode;
  overrideButtonLabel?: string;
}

const ModalComponent = <Data,>({
  open,
  onClose,
  title,
  description,
  data,
  onClick,
  renderContent,
  overrideButtonLabel = "Override",
}: ModalProps<Data>) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          bgcolor: "white",
          boxShadow: 24,
          p: 4,
          maxWidth: 800,
          minWidth: 400,
        }}
      >
        <Typography
          variant="h2"
          fontWeight={300}
          sx={{ fontSize: 20, marginBottom: 1.5 }}
        >

          {title}
        </Typography>

        {description && (
          <Typography variant="subtitle1" fontWeight="normal" sx={{ opacity: 0.6 }}>
            {description}
          </Typography>
        )}
        <Box>
          {data.map((item, index) => (
            <React.Fragment key={index}>
              {renderContent(item, index)}
            </React.Fragment>
          ))}
        </Box>
        <Box sx={{ mt: 4, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="contained" onClick={onClick}>
            {overrideButtonLabel}
          </Button>
          <Button variant="contained" onClick={onClose} sx={{ ml: 2 }}>
            Close & save
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};

export default ModalComponent;
