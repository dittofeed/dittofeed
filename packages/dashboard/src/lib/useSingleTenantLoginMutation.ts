import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";

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
  apiBaseUrl: string,
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
      `${apiBaseUrl}/api/public/single-tenant/login`,
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
