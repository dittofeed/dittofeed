import { useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import { EphemeralRequestStatus } from "isomorphic-lib/src/types";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  Tooltip,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { useMemo } from "react";
import DeleteDialog from "./confirmDeleteDialog";

enum ModalStateType {
  Naming = "Naming",
  Copying = "Copying",
}

interface NamingState {
  type: ModalStateType.Naming;
  newName: string;
}

interface CopyingState {
  type: ModalStateType.Copying;
  keyValue: string;
}

type ModalState = NamingState | CopyingState | null;

interface TableState {
  modalState: ModalState;
  // Map from key id to the status of the delete request
  deleteRequests: Map<string, EphemeralRequestStatus<Error>>;
}

export default function AdminApiKeyTable() {
  const theme = useTheme();
  const { adminApiKeys } = useAppStorePick(["adminApiKeys"]);
  const rows = useMemo(() => {
    if (!adminApiKeys) {
      return [];
    }
    return adminApiKeys.map((key) => ({
      name: key.name,
      createdAt: key.createdAt,
    }));
  }, [adminApiKeys]);
  const [{ modalState, deleteRequests }, setState] = useImmer<TableState>({
    modalState: null,
    deleteRequests: new Map(),
  });

  return (
    <>
      <Stack
        direction="row"
        justifyContent="end"
        sx={{
          width: "100%",
        }}
      >
        <Button
          variant="outlined"
          onClick={() => {
            setState((draft) => {
              draft.modalState = {
                type: ModalStateType.Naming,
                newName: "",
              };
            });
          }}
        >
          Create Webhook Secret
        </Button>
      </Stack>
      <Box
        sx={{
          height: theme.spacing(60),
        }}
      >
        <DataGrid<{ name: string; createdAt: number }>
          rows={rows}
          autoPageSize
          disableRowSelectionOnClick
          sx={{
            "& .MuiDataGrid-cell:focus": {
              outline: "none",
            },
            "& .MuiDataGrid-cell:focus-within": {
              outline: "none",
            },
          }}
          initialState={{
            sorting: {
              sortModel: [
                { field: "createdAt", sort: "desc" },
                { field: "name", sort: "asc" },
              ],
            },
          }}
          columns={[
            {
              field: "name",
              headerName: "Name",
              sortable: false,
              width: 112,
              renderCell: (params) => (
                <Tooltip title={params.row.name}>
                  <span>{params.row.name}</span>
                </Tooltip>
              ),
            },
            {
              field: "createdAt",
              valueGetter: (params) =>
                new Date(params.row.createdAt).toISOString(),
              headerName: "Created At",
            },
            {
              field: "delete",
              headerName: "Delete",
              sortable: false,
              renderCell: (params) => (
                <DeleteDialog
                  title={`Delete ${params.row.name}`}
                  message={`Are you sure you want to delete ${params.row.name}?`}
                  onConfirm={() => {
                    // FIXME
                    console.log("delete");
                  }}
                />
              ),
            },
          ]}
          getRowId={(row) => row.name}
        />
      </Box>
      <Dialog open={newSecretName !== null} onClose={closeDialog}>
        <DialogTitle>Create Webhook Secret</DialogTitle>
        <DialogContent>
          <TextField
            value={newSecretName ?? ""}
            onChange={(e) => {
              setState((draft) => {
                draft.newSecretName = e.target.value;
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // Prevent form submission if inside a form
                addNewSecret();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button onClick={addNewSecret}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
