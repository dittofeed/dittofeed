import { Paper, PaperProps } from "@mui/material";

export function SquarePaper(props: PaperProps) {
  return <Paper {...props} square elevation={4} />;
}
