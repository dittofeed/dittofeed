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
  GetChartDataRequest,
  GetChartDataResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const ANALYSIS_CHART_QUERY_KEY = "analysisChart";

export function useAnalysisChartQuery<TData = GetChartDataResponse>(
  params: Omit<GetChartDataRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetChartDataResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for analysis chart query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [ANALYSIS_CHART_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetChartDataResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetChartDataResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/analysis/chart-data`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetChartDataResponse),
        );
      } catch (error) {
        console.error("Failed to fetch analysis chart data", error);
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}
