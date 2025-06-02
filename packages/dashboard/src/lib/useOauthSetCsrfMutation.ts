import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  // useQueryClient, // Not strictly needed for this mutation unless invalidating something specific
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  // CompletionStatus, // Not strictly needed if workspaceId isn't part of the core logic here
  SetCsrfCookieRequest,
} from "isomorphic-lib/src/types";

// import { useAppStorePick } from "./appStore"; // Only if workspace context is needed
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

// Define the mutation function type
type SetCsrfCookieMutationFn = (request: SetCsrfCookieRequest) => Promise<void>;

export function useOauthSetCsrfMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, SetCsrfCookieRequest>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, SetCsrfCookieRequest> {
  // const queryClient = useQueryClient(); // Include if specific query invalidations are needed
  // const { workspace } = useAppStorePick(["workspace"]); // Include if workspace needed
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: SetCsrfCookieMutationFn = async (request) => {
    // Example of workspace check, though not directly used in this request body
    // if (workspace.type !== CompletionStatus.Successful) {
    //   throw new Error("Workspace not available");
    // }

    await axios.post(`${baseApiUrl}/oauth/set-csrf-cookie`, request, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
    });
  };

  const mutation = useMutation<void, AxiosError, SetCsrfCookieRequest>({
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
