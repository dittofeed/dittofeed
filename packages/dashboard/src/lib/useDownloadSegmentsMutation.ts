import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { CompletionStatus } from "isomorphic-lib/src/types";

import { useAppStorePick } from "./appStore";

// Define parameters if needed, for now, none seem required for the mutation call itself
// as workspaceId is retrieved from the store.
// type DownloadSegmentsParams = Record<string, never>;

// The mutation function doesn't return anything specific on success other than triggering download
type DownloadSegmentsMutationFn = () => Promise<void>;

export function useDownloadSegmentsMutation(
  options?: Omit<
    UseMutationOptions<void, AxiosError>, // No specific params needed for mutate() call
    "mutationFn"
  >,
): UseMutationResult<void, AxiosError, void> {
  const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]);

  const mutationFn: DownloadSegmentsMutationFn = async () => {
    if (workspace.type !== CompletionStatus.Successful) {
      throw new Error("Workspace not available for segment download");
    }
    const workspaceId = workspace.value.id;

    const response = await axios.get(`${apiBase}/api/segments/download`, {
      params: {
        workspaceId,
      },
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
    let filename = "segment-assignments.csv"; // Default filename
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

  const mutation = useMutation<void, AxiosError>({
    mutationFn,
    ...options,
    // onSuccess and onError are handled by the component using the hook
  });

  return mutation;
}
