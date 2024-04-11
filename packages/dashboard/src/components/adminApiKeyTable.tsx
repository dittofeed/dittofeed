import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Tooltip,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import {
  CompletionStatus,
  EphemeralRequestStatus,
  RequestStatus,
} from "isomorphic-lib/src/types";
import { useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
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
  createRequest: RequestStatus<string, Error>;
}

type ModalState = NamingState | CopyingState | null;

interface TableState {
  modalState: ModalState;
  // Map from key id to the status of the delete request
  deleteRequests: Map<string, EphemeralRequestStatus<Error>>;
}

export default function AdminApiKeyTable() {
  const theme = useTheme();
  const { adminApiKeys, apiBase, workspace } = useAppStorePick([
    "adminApiKeys",
    "workspace",
    "apiBase",
  ]);
  const rows = useMemo(() => {
    if (!adminApiKeys) {
      return [];
    }
    return adminApiKeys.map((key) => ({
      name: key.name,
      createdAt: key.createdAt,
      id: key.id,
    }));
  }, [adminApiKeys]);
  const [{ modalState, deleteRequests }, setState] = useImmer<TableState>({
    modalState: null,
    deleteRequests: new Map(),
  });

  const closeDialog = () => {
    setState((draft) => {
      draft.modalState = null;
    });
  };

  // FIXME
  const createKey = () => {};
  const deleteKey = (id: string) => {};

  let dialogContent: React.ReactNode = null;
  if (modalState?.type === ModalStateType.Naming) {
    dialogContent = (
      <TextField
        value={modalState.newName}
        onChange={(e) => {
          setState((draft) => {
            if (draft.modalState?.type !== ModalStateType.Naming) {
              return;
            }
            draft.modalState.newName = e.target.value;
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault(); // Prevent form submission if inside a form
            createKey();
          }
        }}
      />
    );
  } else if (modalState?.type === ModalStateType.Copying) {
    if (modalState.createRequest.type === CompletionStatus.InProgress) {
      // FIXME loading spinner
      dialogContent = "Creating...";
    } else if (modalState.createRequest.type === CompletionStatus.Successful) {
      // FIXME add copy box
      dialogContent = <>{modalState.createRequest.value}</>;
    }
  }

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
          Create Admin API Key
        </Button>
      </Stack>
      <Box
        sx={{
          height: theme.spacing(60),
        }}
      >
        <DataGrid<{ name: string; createdAt: number; id: string }>
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
                  onConfirm={() => deleteKey(params.row.id)}
                />
              ),
            },
          ]}
          getRowId={(row) => row.name}
        />
      </Box>
      <Dialog open={modalState !== null} onClose={closeDialog}>
        <DialogTitle>Create Admin API Key</DialogTitle>
        <DialogContent>{dialogContent}</DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button onClick={createKey}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
