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
  GetSummarizedDataRequest,
  GetSummarizedDataResponse,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const ANALYSIS_SUMMARY_QUERY_KEY = "analysisSummary";

export function useAnalysisSummaryQuery<TData = GetSummarizedDataResponse>(
  params: Omit<GetSummarizedDataRequest, "workspaceId">,
  options?: Omit<
    UseQueryOptions<GetSummarizedDataResponse, Error, TData>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();

  if (workspace.type !== CompletionStatus.Successful) {
    throw new Error("Workspace not available for analysis summary query");
  }

  const workspaceId = workspace.value.id;
  const queryKey = [ANALYSIS_SUMMARY_QUERY_KEY, { ...params, workspaceId }];
  const baseApiUrl = useBaseApiUrl();

  const queryResult = useQuery<GetSummarizedDataResponse, Error, TData>({
    queryKey,
    queryFn: async (): Promise<GetSummarizedDataResponse> => {
      try {
        const response = await axios.get(`${baseApiUrl}/analysis/summary`, {
          params: {
            ...params,
            workspaceId,
          },
          headers: authHeaders,
        });

        return unwrap(
          schemaValidateWithErr(response.data, GetSummarizedDataResponse),
        );
      } catch (error) {
        console.error("Failed to fetch analysis summary data", error);
        throw error;
      }
    },
    ...options,
  });

  return queryResult;
}