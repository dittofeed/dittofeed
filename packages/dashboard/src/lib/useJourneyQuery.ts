import { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import {
  GetJourneysRequest,
  GetJourneysResponse,
  GetJourneysResponseItem,
} from "isomorphic-lib/src/types";

import { useJourneysQuery } from "./useJourneysQuery";

// Define the specific desired output type for the data property
type SelectedData = GetJourneysResponseItem | null;

// Define the type fetched by the underlying query
type FetchedData = GetJourneysResponse;

/**
 * Custom hook for fetching a single journey by ID using the underlying
 * useJourneysQuery hook.
 * Returns the journey resource directly, or null if not found/loading/error.
 */
export function useJourneyQuery(
  // The ID of the journey to fetch
  journeyId?: string,
  // Optional query options, excluding queryKey and queryFn.
  // Caller can now control 'enabled' directly.
  options?: Omit<
    // Input type for options
    // but the select function determines the final TData type.
    UseQueryOptions<FetchedData, Error, SelectedData>,
    "queryKey" | "queryFn" | "select" // select is provided internally
  >,
): UseQueryResult<SelectedData> {
  // Prepare the params for the underlying hook
  const params: Omit<GetJourneysRequest, "workspaceId"> = {
    ids: journeyId ? [journeyId] : [],
  };

  const enabled = journeyId !== undefined && options?.enabled !== false;

  // Call the existing hook, explicitly providing generic types
  // TQueryFnData = FetchedData, TError = Error, TData = SelectedData
  const queryResult = useJourneysQuery(params, {
    ...options,
    enabled,
    // Use select to pick the single journey from the array
    select: (data: FetchedData | undefined): SelectedData => {
      if (!data) {
        return null;
      }
      // Since we queried by ID, we expect at most one result
      const journey = data.journeys.find((j) => j.id === journeyId);
      return journey ?? null;
    },
  });

  // queryResult should now correctly be UseQueryResult<SelectedData, Error>
  return queryResult;
}
