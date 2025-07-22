import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { CompletionStatus, DownloadEventsRequest } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";

type DownloadEventsParams = Omit<DownloadEventsRequest, "workspaceId">;

type DownloadEventsMutationFn = (params: DownloadEventsParams) => Promise<void>;

export function useDownloadEventsMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError, DownloadEventsParams>,
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, DownloadEventsParams> {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  const mutationFn: DownloadEventsMutationFn = async (params) => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for events download");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.get(`${baseApiUrl}/events/download`, {
      params: {
        workspaceId,
        ...params,
      },
      headers: authHeaders,
      responseType: "blob", // Important for file downloads
    });

    // Manually trigger download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;

    // Extract filename from content-disposition header if available, otherwise fallback
    const contentDisposition = response.headers["content-disposition"] as
      | string
      | undefined;
    let filename = "events.csv"; // Default filename
    if (typeof contentDisposition === "string") {
      // Use regex similar to downloadFileFactory
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(contentDisposition);

      // Use optional chaining and check for the specific group
      const extractedFilename = matches?.[1]?.replace(/['"]/g, "");

      if (extractedFilename) {
        filename = extractedFilename;
      }
    }

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const mutation = useMutation<void, AxiosError, DownloadEventsParams>({
    mutationFn,
    ...options,
    // onSuccess and onError are handled by the component using the hook
  });

  return mutation;
}