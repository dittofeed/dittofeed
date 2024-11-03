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
import { SecretNames } from "isomorphic-lib/src/constants";
import { ChannelType } from "isomorphic-lib/src/types";
import { useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import { KeyedSecretEditor, SecretButton } from "./secretEditor";

export default function WebhookSecretTable() {
  const { secretAvailability } = useAppStorePick(["secretAvailability"]);
  const [{ newSecretValues, newSecretName }, setState] = useImmer<{
    newSecretName: string | null;
    newSecretValues: Set<string>;
  }>({
    newSecretValues: new Set(),
    newSecretName: null,
  });
  const theme = useTheme();

  const webhookSecrets = useMemo(() => {
    const config = secretAvailability.find(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      (s) => s.name === SecretNames.Webhook,
    )?.configValue;
    const savedOptions = Object.entries(config ?? {}).flatMap(
      ([key, saved]) => {
        if (key === "type" || !saved) {
          return [];
        }
        const name = key;
        return {
          name,
          saved: true,
        };
      },
    );
    const unsavedOptions = Array.from(newSecretValues).flatMap((name) => {
      if (config?.[name] !== undefined) {
        return [];
      }
      return {
        name,
        saved: false,
      };
    });
    return unsavedOptions.concat(savedOptions).map(({ name, saved }) => ({
      name,
      saved,
      savedIndex: saved ? 0 : 1,
    }));
  }, [secretAvailability, newSecretValues]);

  const closeDialog = () =>
    setState((draft) => {
      draft.newSecretName = null;
    });
  const addNewSecret = () => {
    setState((draft) => {
      if (!draft.newSecretName) {
        return;
      }
      draft.newSecretValues.add(draft.newSecretName);
      draft.newSecretName = null;
    });
  };

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
              draft.newSecretName = "";
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
        <DataGrid<{ name: string; saved: boolean; savedIndex: number }>
          rows={webhookSecrets}
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
                { field: "savedIndex", sort: "asc" },
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
              sortable: false,
              field: "saved",
              flex: 1,
              valueGetter: (params) => (params.row.saved ? 0 : 1),
              headerName: "Update",
              renderCell: (params) => (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    height: "100%",
                    width: "100%",
                  }}
                >
                  <KeyedSecretEditor
                    type={ChannelType.Webhook}
                    name={SecretNames.Webhook}
                    saved={params.row.saved}
                    label={params.row.name}
                    secretKey={params.row.name}
                  />
                  {params.row.saved ? null : (
                    <SecretButton
                      onClick={() => {
                        setState((draft) => {
                          draft.newSecretValues.delete(params.row.name);
                        });
                      }}
                    >
                      Delete
                    </SecretButton>
                  )}
                </Stack>
              ),
            },
          ]}
          getRowId={(row) => row.name}
        />
      </Box>
      <Dialog open={newSecretName !== null} onClose={closeDialog}>
        <DialogTitle>Name Your Webhook Secret</DialogTitle>
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
