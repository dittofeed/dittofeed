import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  ComponentConfigurationEnum,
  GetComponentConfigurationsRequest,
  GetComponentConfigurationsResponse,
  MessageTemplateConfiguration,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const COMPONENT_CONFIGURATIONS_QUERY_KEY = "componentConfigurations";

/**
 * Custom hook for fetching component configurations using the GET /api/componentConfigurations endpoint
 */
export function useComponentConfigurationsQuery<TData = GetComponentConfigurationsResponse>(
  params?: Omit<GetComponentConfigurationsRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetComponentConfigurationsResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for component configurations query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [COMPONENT_CONFIGURATIONS_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetComponentConfigurationsResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetComponentConfigurationsResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/componentConfigurations`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        const result = schemaValidateWithErr(
          response.data,
          GetComponentConfigurationsResponse,
        );

        return unwrap(result);
      } catch (error) {
        throw new Error(`Failed to fetch component configurations: ${error}`);
      }
    },
    ...options,
  });

  return queryResult;
}

/**
 * Hook to get MessageTemplate configuration specifically
 */
export function useMessageTemplateConfigurationQuery(
  options?: Omit<
    UseQueryOptions<MessageTemplateConfiguration | undefined, Error, MessageTemplateConfiguration | undefined>,
    "queryKey" | "queryFn" | "select"
  >,
): UseQueryResult<MessageTemplateConfiguration | undefined> {
  return useComponentConfigurationsQuery(undefined, {
    ...options,
    select: (data: GetComponentConfigurationsResponse | undefined): MessageTemplateConfiguration | undefined => {
      if (!data) {
        return undefined;
      }
      
      const messageTemplateConfig = data.componentConfigurations.find(
        (config) => config.definition.type === ComponentConfigurationEnum.MessageTemplate
      );
      
      if (messageTemplateConfig?.definition.type === ComponentConfigurationEnum.MessageTemplate) {
        return messageTemplateConfig.definition;
      }
      
      return undefined;
    },
  });
}