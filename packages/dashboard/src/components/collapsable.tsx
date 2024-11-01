import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Collapse,
  IconButton,
  IconButtonProps,
  Stack,
  styled,
} from "@mui/material";
import React, { useState } from "react";

interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
}

const ExpandMore = styled((props: ExpandMoreProps) => {
  const iconProps: Partial<ExpandMoreProps> = { ...props };
  delete iconProps.expand;
  return <IconButton {...iconProps} />;
})(({ theme, expand }) => ({
  transform: !expand ? "rotate(0deg)" : "rotate(180deg)",
  marginLeft: "auto",
  transition: theme.transitions.create("transform", {
    duration: theme.transitions.duration.shortest,
  }),
}));

export function Collapaseable({
  header,
  children,
}: {
  header: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(true);
  const handleOpen = () => {
    setOpen((o) => !o);
  };
  return (
    <Box>
      <Stack direction="row" spacing={2}>
        <Box>{header}</Box>
        <Box>
          <ExpandMore
            expand={open}
            onClick={handleOpen}
            aria-expanded={open}
            aria-label="show more"
          >
            <ExpandMoreIcon />
          </ExpandMore>
        </Box>
      </Stack>
      <Collapse in={open} unmountOnExit sx={{ p: 1 }}>
        {children}
      </Collapse>
    </Box>
  );
}
