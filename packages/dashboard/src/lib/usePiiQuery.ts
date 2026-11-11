import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import {
  CompletionStatus,
  GetPiiAccessAuditResponse,
  GetPiiFieldsResponse,
  PiiCategory,
  PiiFieldScope,
} from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

export const PII_FIELDS_QUERY_KEY = "piiFields";
export const PII_AUDIT_QUERY_KEY = "piiAudit";

export interface PiiColumnCatalogEntry {
  name: string;
  category: PiiCategory;
  description: string;
}

export interface PiiColumnCatalogResponse {
  columns: PiiColumnCatalogEntry[];
}

export function usePiiFieldsQuery(
  scope?: PiiFieldScope,
  options?: Omit<
    UseQueryOptions<
      GetPiiFieldsResponse,
      AxiosError,
      GetPiiFieldsResponse,
      readonly [string, { workspaceId: string; scope?: string }]
    >,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<GetPiiFieldsResponse, AxiosError> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  const queryFn = async (): Promise<GetPiiFieldsResponse> => {
    if (!workspaceId) {
      throw new Error("Workspace not available");
    }
    const response = await axios.get(`${baseApiUrl}/pii/fields`, {
      params: { workspaceId, scope },
      headers: { ...authHeaders },
    });
    return response.data;
  };

  return useQuery({
    queryKey: [PII_FIELDS_QUERY_KEY, { workspaceId: workspaceId ?? "", scope }] as const,
    queryFn,
    enabled: !!workspaceId,
    ...options,
  });
}

export function usePiiColumnCatalogQuery(
  options?: Omit<
    UseQueryOptions<
      PiiColumnCatalogResponse,
      AxiosError,
      PiiColumnCatalogResponse,
      readonly [string]
    >,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<PiiColumnCatalogResponse, AxiosError> {
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const queryFn = async (): Promise<PiiColumnCatalogResponse> => {
    const response = await axios.get(`${baseApiUrl}/pii/catalog`, {
      headers: { ...authHeaders },
    });
    return response.data;
  };

  return useQuery({
    queryKey: ["piiCatalog"] as const,
    queryFn,
    ...options,
  });
}

export function usePiiAuditQuery(
  options?: Omit<
    UseQueryOptions<
      GetPiiAccessAuditResponse,
      AxiosError,
      GetPiiAccessAuditResponse,
      readonly [string, { workspaceId: string }]
    >,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<GetPiiAccessAuditResponse, AxiosError> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const workspaceId =
    workspace.type === CompletionStatus.Successful ? workspace.value.id : null;

  const queryFn = async (): Promise<GetPiiAccessAuditResponse> => {
    if (!workspaceId) {
      throw new Error("Workspace not available");
    }
    const response = await axios.get(`${baseApiUrl}/pii/audit`, {
      params: { workspaceId, limit: 50 },
      headers: { ...authHeaders },
    });
    return response.data;
  };

  return useQuery({
    queryKey: [PII_AUDIT_QUERY_KEY, { workspaceId: workspaceId ?? "" }] as const,
    queryFn,
    enabled: !!workspaceId,
    ...options,
  });
}
