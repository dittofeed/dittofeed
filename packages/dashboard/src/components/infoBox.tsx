import { SxProps, Theme, Typography, useTheme } from "@mui/material";

export default function InfoBox({
  children,
  sx,
}: {
  children?: React.ReactNode;
  sx?: SxProps<Theme>;
}) {
  const theme = useTheme();
  return (
    <Typography
      sx={{
        backgroundColor: theme.palette.grey[200],
        p: 2,
        borderRadius: 1,
        ...sx,
      }}
      variant="subtitle2"
    >
      {children}
    </Typography>
  );
}
