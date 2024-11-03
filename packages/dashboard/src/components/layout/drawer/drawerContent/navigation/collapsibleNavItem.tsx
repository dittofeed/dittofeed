import { Accordion, AccordionDetails, AccordionSummary } from "@mui/material";
import { GridExpandMoreIcon } from "@mui/x-data-grid";
import { PropsWithChildren } from "react";

function CollapsibleNavItem({ children }: PropsWithChildren<object>) {
  return (
    <Accordion disableGutters>
      <AccordionSummary
        expandIcon={<GridExpandMoreIcon />}
        aria-controls="panel1a-content"
        id="panel1a-header"
      >
        {children}
      </AccordionSummary>
      <AccordionDetails>a</AccordionDetails>
    </Accordion>
  );
}

export default CollapsibleNavItem;
