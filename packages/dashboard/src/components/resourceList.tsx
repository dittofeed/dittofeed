import { AddCircleOutline } from "@mui/icons-material";
import { IconButton, List, Stack, Typography } from "@mui/material";
import Link from "next/link";

export function ResourceList({ children }: { children: React.ReactNode }) {
  return (
    <List
      sx={{
        width: "100%",
        bgcolor: "background.paper",
        borderRadius: 1,
      }}
    >
      {children}
    </List>
  );
}

export function ResourceListContainer({
  children,
  title,
  newItemHref,
}: {
  children: React.ReactNode;
  newItemHref: string;
  title: string;
}) {
  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        maxWidth: "40rem",
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          {title}
        </Typography>
        <IconButton LinkComponent={Link} href={newItemHref}>
          <AddCircleOutline />
        </IconButton>
      </Stack>
      {children}
    </Stack>
  );
}
