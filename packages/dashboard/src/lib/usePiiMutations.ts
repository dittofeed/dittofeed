import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  CreatePiiFieldsRequest,
  DeletePiiFieldRequest,
  PiiCategory,
  PiiFieldScope,
  UpdatePiiFieldRequest,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { PII_FIELDS_QUERY_KEY } from "./usePiiQuery";

function usePiiInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [PII_FIELDS_QUERY_KEY] });
  };
}

export function useCreatePiiFieldsMutation() {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();
  const invalidate = usePiiInvalidate();

  return useMutation<
    void,
    AxiosError,
    { fields: { scope: PiiFieldScope; name: string; category?: PiiCategory }[] }
  >({
    mutationFn: async ({ fields }) => {
      if (workspace.type !== CompletionStatus.Successful) {
        throw new Error("Workspace not available");
      }
      await axios.post(
        `${baseApiUrl}/pii/fields`,
        {
          workspaceId: workspace.value.id,
          fields,
        } satisfies CreatePiiFieldsRequest,
        {
          headers: { "Content-Type": "application/json", ...authHeaders },
        },
      );
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePiiFieldMutation() {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();
  const invalidate = usePiiInvalidate();

  return useMutation<
    void,
    AxiosError,
    { id: string; category: PiiCategory }
  >({
    mutationFn: async ({ id, category }) => {
      if (workspace.type !== CompletionStatus.Successful) {
        throw new Error("Workspace not available");
      }
      await axios.patch(
        `${baseApiUrl}/pii/fields`,
        {
          workspaceId: workspace.value.id,
          id,
          category,
        } satisfies UpdatePiiFieldRequest,
        {
          headers: { "Content-Type": "application/json", ...authHeaders },
        },
      );
    },
    onSuccess: invalidate,
  });
}

export function useDeletePiiFieldMutation() {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();
  const invalidate = usePiiInvalidate();

  return useMutation<void, AxiosError, { id: string }>({
    mutationFn: async ({ id }) => {
      if (workspace.type !== CompletionStatus.Successful) {
        throw new Error("Workspace not available");
      }
      await axios.delete(`${baseApiUrl}/pii/fields`, {
        data: {
          workspaceId: workspace.value.id,
          id,
        } satisfies DeletePiiFieldRequest,
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
    },
    onSuccess: invalidate,
  });
}
