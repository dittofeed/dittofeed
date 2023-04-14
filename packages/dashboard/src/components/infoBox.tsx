import { Typography, useTheme } from "@mui/material";

export default function InfoBox({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Typography
      sx={{
        backgroundColor: theme.palette.grey[200],
        p: 2,
        borderRadius: 1,
      }}
      variant="subtitle2"
    >
      {children}
    </Typography>
  );
}
