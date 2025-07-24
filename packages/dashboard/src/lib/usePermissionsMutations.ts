import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  CreateWorkspaceMemberRoleRequest,
  DeleteWorkspaceMemberRoleRequest,
  UpdateWorkspaceMemberRoleRequest,
  WorkspaceMemberRoleResource,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const PERMISSIONS_QUERY_KEY = "permissions";

export function useCreatePermissionMutation(
  options?: Omit<
    UseMutationOptions<
      WorkspaceMemberRoleResource,
      AxiosError,
      Omit<CreateWorkspaceMemberRoleRequest, "workspaceId">
    >,
    "mutationFn"
  >,
): UseMutationResult<
  WorkspaceMemberRoleResource,
  AxiosError,
  Omit<CreateWorkspaceMemberRoleRequest, "workspaceId">
> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    data: Omit<CreateWorkspaceMemberRoleRequest, "workspaceId">,
  ): Promise<WorkspaceMemberRoleResource> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for permission creation");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.post(
      `${baseApiUrl}/permissions`,
      {
        ...data,
        workspaceId,
      } satisfies CreateWorkspaceMemberRoleRequest,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    return response.data;
  };

  const mutation = useMutation<
    WorkspaceMemberRoleResource,
    AxiosError,
    Omit<CreateWorkspaceMemberRoleRequest, "workspaceId">
  >({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [PERMISSIONS_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}

export function useUpdatePermissionMutation(
  options?: Omit<
    UseMutationOptions<
      WorkspaceMemberRoleResource,
      AxiosError,
      Omit<UpdateWorkspaceMemberRoleRequest, "workspaceId">
    >,
    "mutationFn"
  >,
): UseMutationResult<
  WorkspaceMemberRoleResource,
  AxiosError,
  Omit<UpdateWorkspaceMemberRoleRequest, "workspaceId">
> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    data: Omit<UpdateWorkspaceMemberRoleRequest, "workspaceId">,
  ): Promise<WorkspaceMemberRoleResource> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for permission update");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.put(
      `${baseApiUrl}/permissions`,
      {
        ...data,
        workspaceId,
      } satisfies UpdateWorkspaceMemberRoleRequest,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      },
    );

    return response.data;
  };

  const mutation = useMutation<
    WorkspaceMemberRoleResource,
    AxiosError,
    Omit<UpdateWorkspaceMemberRoleRequest, "workspaceId">
  >({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [PERMISSIONS_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}

export function useDeletePermissionMutation(
  options?: Omit<
    UseMutationOptions<
      void,
      AxiosError,
      Omit<DeleteWorkspaceMemberRoleRequest, "workspaceId">
    >,
    "mutationFn"
  >,
): UseMutationResult<
  void,
  AxiosError,
  Omit<DeleteWorkspaceMemberRoleRequest, "workspaceId">
> {
  const queryClient = useQueryClient();
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn = async (
    data: Omit<DeleteWorkspaceMemberRoleRequest, "workspaceId">,
  ): Promise<void> => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for permission deletion");
    }
    const workspaceId = workspace.value.id;

    await axios.delete(`${baseApiUrl}/permissions`, {
      data: {
        ...data,
        workspaceId,
      } satisfies DeleteWorkspaceMemberRoleRequest,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  const mutation = useMutation<
    void,
    AxiosError,
    Omit<DeleteWorkspaceMemberRoleRequest, "workspaceId">
  >({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);

      if (workspace.type === CompletionStatus.Successful) {
        const workspaceId = workspace.value.id;
        queryClient.invalidateQueries({
          queryKey: [PERMISSIONS_QUERY_KEY, { workspaceId }],
        });
      }
    },
  });

  return mutation;
}
