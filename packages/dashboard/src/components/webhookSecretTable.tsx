import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { SecretNames } from "isomorphic-lib/src/constants";
import { ChannelType } from "isomorphic-lib/src/types";
import { useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import { SecretEditor } from "./secretEditor";

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
        if (key === "type") {
          return [];
        }
        const name = key;
        return {
          name,
          saved,
        };
      },
    );
    const unsavedOptions = Array.from(newSecretValues).map((name) => ({
      name,
      saved: false,
    }));
    return unsavedOptions.concat(savedOptions);
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
      <Box
        sx={{
          height: theme.spacing(40),
        }}
      >
        <DataGrid<{ name: string; saved: boolean }>
          rows={webhookSecrets}
          autoPageSize
          initialState={{
            sorting: {
              sortModel: [{ field: "name", sort: "asc" }],
            },
          }}
          columns={[
            {
              field: "name",
              headerName: "Name",
              sortComparator: (value, row) => {
                return 0;
              },
            },
            {
              field: "update",
              flex: 1,
              headerName: "Update",
              renderCell: (params) => (
                <SecretEditor
                  type={ChannelType.Webhook}
                  name={SecretNames.Webhook}
                  saved={params.row.saved}
                  secretKey={params.row.name}
                />
              ),
            },
          ]}
          getRowId={(row) => row.name}
          disableRowSelectionOnClick
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
