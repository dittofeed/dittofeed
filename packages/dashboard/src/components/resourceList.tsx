import { AddCircleOutline } from "@mui/icons-material";
import {
  Button,
  List,
  ListItemButton,
  Stack,
  SxProps,
  Theme,
  Tooltip,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";

export function ResourceListItemButton({
  sx,
  href,
  children,
}: {
  sx?: SxProps<Theme>;
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <ListItemButton
      LinkComponent={Link}
      href={href}
      sx={{
        border: 1,
        borderTopLeftRadius: 1,
        borderBottomLeftRadius: 1,
        borderColor: "grey.200",
        ...sx,
      }}
    >
      {children}
    </ListItemButton>
  );
}

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
  controls,
  titleSingular,
}: {
  children: React.ReactNode;
  controls?: React.ReactNode;
  newItemHref: (id: string) => string;
  title: string;
  titleSingular: string;
}) {
  const [newItemId, setNewItemId] = useState(() => uuid());
  const href = useMemo(() => newItemHref(newItemId), [newItemHref, newItemId]);

  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        margin: "1rem",
        bgcolor: "background.paper",
        borderRadius: 1,
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          {title}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {controls}
          <Tooltip title="create new" placement="right" arrow>
            <Button
              variant="contained"
              startIcon={<AddCircleOutline />}
              LinkComponent={Link}
              href={href}
              onClick={() => {
                setNewItemId(uuid());
              }}
            >
              Create {titleSingular}
            </Button>
          </Tooltip>
        </Stack>
      </Stack>
      {children}
    </Stack>
  );
}
