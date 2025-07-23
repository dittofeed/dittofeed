import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { UserSubscriptionsUpdate } from "isomorphic-lib/src/types";

export type UpdateSubscriptionsMutationParams = UserSubscriptionsUpdate;

// Define the mutation function type
type UpdateSubscriptionsMutationFn = (
  data: UpdateSubscriptionsMutationParams,
) => Promise<void>;

export function useUpdateSubscriptionsMutation(
  apiBase: string,
  options?: Omit<
    UseMutationOptions<void, AxiosError, UpdateSubscriptionsMutationParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, UpdateSubscriptionsMutationParams> {
  const mutationFn: UpdateSubscriptionsMutationFn = async (data) => {
    await axios({
      method: "PUT",
      url: `${apiBase}/api/public/subscription-management/user-subscriptions`,
      data,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const mutation = useMutation<
    void,
    AxiosError,
    UpdateSubscriptionsMutationParams
  >({
    mutationFn,
    ...options,
  });

  return mutation;
}
