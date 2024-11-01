import {
  Alert,
  Box,
  Button,
  CircularProgress,
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
  CreateAdminApiKeyRequest,
  CreateAdminApiKeyResponse,
  DeleteAdminApiKeyRequest,
  EmptyResponse,
  EphemeralRequestStatus,
} from "isomorphic-lib/src/types";
import React, { useCallback, useMemo } from "react";
import { useImmer } from "use-immer";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import { copyInputProps } from "../lib/copyToClipboard";
import DeleteDialog from "./confirmDeleteDialog";

enum ModalStateType {
  Naming = "Naming",
  Copying = "Copying",
}

interface NamingState {
  type: ModalStateType.Naming;
  createRequest: EphemeralRequestStatus<Error>;
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
  const {
    adminApiKeys,
    apiBase,
    workspace,
    upsertAdminApiKey,
    deleteAdminApiKey,
  } = useAppStorePick([
    "adminApiKeys",
    "workspace",
    "apiBase",
    "upsertAdminApiKey",
    "deleteAdminApiKey",
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

  const createKey = useCallback(() => {
    if (
      workspace.type !== CompletionStatus.Successful ||
      modalState?.type !== ModalStateType.Naming
    ) {
      return;
    }
    apiRequestHandlerFactory({
      request: modalState.createRequest,
      onFailureNoticeHandler: () =>
        `Failed to create API key: ${modalState.newName}`,
      requestConfig: {
        method: "POST",
        url: `${apiBase}/api/admin-keys`,
        data: {
          workspaceId: workspace.value.id,
          name: modalState.newName,
        } satisfies CreateAdminApiKeyRequest,
      },
      setRequest: (request) => {
        setState((draft) => {
          if (draft.modalState?.type !== ModalStateType.Naming) {
            return;
          }
          draft.modalState.createRequest = request;
        });
      },
      responseSchema: CreateAdminApiKeyResponse,
      setResponse: (response) => {
        upsertAdminApiKey({
          workspaceId: response.workspaceId,
          id: response.id,
          name: response.name,
          createdAt: response.createdAt,
        });

        setState((draft) => {
          draft.modalState = {
            type: ModalStateType.Copying,
            keyValue: response.apiKey,
          };
        });
      },
    })();
  }, [modalState, setState, workspace, upsertAdminApiKey, apiBase]);
  const deleteKey = useCallback(
    (id: string) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const deleteRequest = deleteRequests.get(id) ?? {
        type: CompletionStatus.NotStarted,
      };
      apiRequestHandlerFactory({
        request: deleteRequest,
        onFailureNoticeHandler: () => "Failed to delete API key.",
        responseSchema: EmptyResponse,
        requestConfig: {
          method: "DELETE",
          url: `${apiBase}/api/admin-keys`,
          params: {
            workspaceId: workspace.value.id,
            id,
          } satisfies DeleteAdminApiKeyRequest,
        },
        setRequest: (request) => {
          setState((draft) => {
            draft.deleteRequests.set(id, request);
          });
        },
        setResponse: () => {
          deleteAdminApiKey(id);
          setState((draft) => {
            draft.deleteRequests.delete(id);
          });
        },
      })();
    },
    [deleteAdminApiKey, deleteRequests, setState, workspace, apiBase],
  );

  let dialogContent: React.ReactNode = null;
  let dialogActions: React.ReactNode = null;
  if (modalState?.type === ModalStateType.Naming) {
    if (modalState.createRequest.type === CompletionStatus.InProgress) {
      dialogContent = <CircularProgress />;

      dialogActions = (
        <>
          <Button disabled>Cancel</Button>
          <Button disabled>Create</Button>
        </>
      );
    } else {
      dialogContent = (
        <TextField
          sx={{
            width: "100%",
          }}
          label="API Key Name"
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
    }
    dialogActions = (
      <>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button onClick={createKey}>Create</Button>
      </>
    );
  } else if (modalState?.type === ModalStateType.Copying) {
    dialogContent = (
      <>
        <Alert severity="warning">
          Make sure to copy, and securely store this API Key. You will not be
          able to access it again after closing this dialogue.
        </Alert>
        <TextField
          value={modalState.keyValue}
          fullWidth
          InputProps={{
            ...copyInputProps({
              value: modalState.keyValue,
              successNotice: "Copied Admin API Key.",
              failureNotice: "Failed to copy Admin API Key.",
            }),
            readOnly: true,
          }}
        />
      </>
    );

    dialogActions = <Button onClick={closeDialog}>Close</Button>;
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
                createRequest: {
                  type: CompletionStatus.NotStarted,
                },
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
              flex: 1,
              renderCell: (params) => (
                <Tooltip title={params.row.name}>
                  <span>{params.row.name}</span>
                </Tooltip>
              ),
            },
            {
              field: "createdAt",
              width: 200,
              valueGetter: (_params, row) =>
                new Date(row.createdAt).toISOString(),
              headerName: "Created At",
            },
            {
              field: "delete",
              headerName: "Delete",
              sortable: false,
              renderCell: (params) => (
                <DeleteDialog
                  disabled={
                    deleteRequests.get(params.row.id)?.type ===
                    CompletionStatus.InProgress
                  }
                  title={`Delete Admin API Key ${params.row.name}`}
                  message={`Are you sure you want to delete ${params.row.name}?`}
                  onConfirm={() => deleteKey(params.row.id)}
                />
              ),
            },
          ]}
          getRowId={(row) => row.name}
        />
      </Box>
      <Dialog open={modalState !== null} onClose={closeDialog} fullWidth>
        <DialogTitle>Create Admin API Key</DialogTitle>
        <DialogContent>
          <Stack
            direction="column"
            spacing={1}
            sx={{
              width: "100%",
              p: 2,
            }}
          >
            {dialogContent}
          </Stack>
        </DialogContent>
        <DialogActions>{dialogActions}</DialogActions>
      </Dialog>
    </>
  );
}
