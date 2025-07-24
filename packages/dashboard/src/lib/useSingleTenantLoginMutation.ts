import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";

import { apiBase } from "./apiBase";

interface SingleTenantLoginParams {
  password: string;
}

interface SingleTenantLoginResponse {
  success: boolean;
}

interface SingleTenantLoginError {
  message: string;
}

type SingleTenantLoginMutationFn = (
  data: SingleTenantLoginParams,
) => Promise<SingleTenantLoginResponse>;

export function useSingleTenantLoginMutation(
  options?: Omit<
    UseMutationOptions<
      SingleTenantLoginResponse,
      AxiosError<SingleTenantLoginError>,
      SingleTenantLoginParams
    >,
    "mutationFn"
  >,
): UseMutationResult<
  SingleTenantLoginResponse,
  AxiosError<SingleTenantLoginError>,
  SingleTenantLoginParams
> {
  const mutationFn: SingleTenantLoginMutationFn = async (data) => {
    const response = await axios.post(
      `${apiBase()}/api/public/single-tenant/login`,
      {
        password: data.password,
      },
    );

    return response.data;
  };

  const mutation = useMutation<
    SingleTenantLoginResponse,
    AxiosError<SingleTenantLoginError>,
    SingleTenantLoginParams
  >({
    mutationFn,
    ...options,
  });

  return mutation;
}
