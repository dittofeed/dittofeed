import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
} from "isomorphic-lib/src/types";

import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export function useCreateWorkspaceMutation(
  options?: Omit<
    UseMutationOptions<
      CreateWorkspaceResponse,
      AxiosError,
      CreateWorkspaceRequest
    >,
    "mutationFn"
  >,
): UseMutationResult<
  CreateWorkspaceResponse,
  AxiosError,
  CreateWorkspaceRequest
> {
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  return useMutation({
    mutationFn: async (body: CreateWorkspaceRequest) => {
      const response = await axios.post<CreateWorkspaceResponse>(
        `${baseApiUrl}/workspaces`,
        body,
        {
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
        },
      );
      return response.data;
    },
    ...options,
  });
}
