import { AddCircleOutline } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  Stack,
  SxProps,
  TextField,
  Theme,
  Tooltip,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useMemo, useRef, useState } from "react";
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

  const router = useRouter();
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = useCallback(() => {
    const queryParams = new URLSearchParams();
    queryParams.set("name", newName);
    setOpenCreateDialog(false);
    router.push(`${href}?${queryParams.toString()}`);
  }, [href, newName, router]);

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
              onClick={() => {
                setNewItemId(uuid());
                setOpenCreateDialog(true);
              }}
            >
              Create {titleSingular}
            </Button>
          </Tooltip>
        </Stack>
      </Stack>
      {children}

      <Dialog
        open={openCreateDialog}
        onClose={() => setOpenCreateDialog(false)}
        TransitionProps={{
          onEntered: () => {
            inputRef.current?.focus();
          },
        }}
      >
        <DialogTitle>Create New {titleSingular}</DialogTitle>
        <DialogContent>
          <Stack alignItems="flex-start">
            <TextField
              sx={{ width: "100%", mt: 2 }}
              label="Name"
              inputRef={inputRef}
              value={newName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              onChange={(e) => setNewName(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreateDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!newName}
            onClick={handleCreate}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
