import { AddCircleOutline } from "@mui/icons-material";
import {
  IconButton,
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
import InfoTooltip from "./infoTooltip";

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
}: {
  children: React.ReactNode;
  newItemHref: (id: string) => string;
  title: string;
}) {
  const [newItemId, setNewItemId] = useState(() => uuid());
  const href = useMemo(() => newItemHref(newItemId), [newItemHref, newItemId]);

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
        {/* <IconButton></IconButton> */}
        <Tooltip title="create new" placement="right" arrow>
          <IconButton
            LinkComponent={Link}
            href={href}
            onClick={() => {
              setNewItemId(uuid());
            }}
          >
            <AddCircleOutline />
          </IconButton>
        </Tooltip>
      </Stack>
      {children}
    </Stack>
  );
}
