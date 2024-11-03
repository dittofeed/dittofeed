import { InfoOutlined } from "@mui/icons-material";
import { Stack, Tooltip, useTheme } from "@mui/material";

export default function InfoTooltip({
  children,
  title,
}: {
  children?: React.ReactElement;
  title: string;
}) {
  const theme = useTheme();
  return (
    <Stack spacing={1} direction="row" alignItems="center">
      {children}
      <Tooltip title={title}>
        <InfoOutlined sx={{ color: theme.palette.grey[400] }} />
      </Tooltip>
    </Stack>
  );
}
