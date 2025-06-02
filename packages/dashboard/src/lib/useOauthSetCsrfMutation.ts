import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  // useQueryClient, // Not strictly needed for this mutation unless invalidating something specific
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus, // Import if workspace check is re-enabled
  SetCsrfCookieRequest, // This type should now include workspaceId
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore"; // Will be used now
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

// Type for the variables passed to the mutate function from the component
export type OauthSetCsrfInput = Omit<SetCsrfCookieRequest, "workspaceId">;

// Define the mutation function type (internal, takes the simplified input)
type SetCsrfCookieMutationFn = (input: OauthSetCsrfInput) => Promise<void>;

export function useOauthSetCsrfMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, OauthSetCsrfInput>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, OauthSetCsrfInput> {
  // const queryClient = useQueryClient(); // Include if specific query invalidations are needed
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: SetCsrfCookieMutationFn = async (input) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error(
        "Workspace not available for setting CSRF cookie. Cannot get workspaceId.",
      );
    }
    const workspaceId = workspace.value.id;

    const apiRequest: SetCsrfCookieRequest = {
      ...input,
      workspaceId,
    };

    await axios.post(`${baseApiUrl}/oauth/set-csrf-cookie`, apiRequest, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  const mutation = useMutation<void, AxiosError, OauthSetCsrfInput>({
    mutationFn,
    ...options,
    onSuccess: (data, variables, context) => {
      options?.onSuccess?.(data, variables, context);
      // No specific query invalidation is obviously needed just from setting a cookie,
      // unless this action has side effects on other cached data.
    },
    // onError, onSettled as needed
  });

  return mutation;
}
