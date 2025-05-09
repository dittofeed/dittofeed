import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  JourneyStatsRequest,
  JourneyStatsResponse,
} from "isomorphic-lib/src/types";
import React from "react";

import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { AppContents } from "./types";

export function useJourneyStats(
  args: Partial<Omit<JourneyStatsRequest, "workspaceId">> &
    Pick<JourneyStatsRequest, "workspaceId"> &
    Pick<AppContents, "upsertJourneyStats" | "setJourneyStatsRequest">,
) {
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  React.useEffect(() => {
    (async () => {
      if (!args.workspaceId) {
        return;
      }
      args.setJourneyStatsRequest({
        type: CompletionStatus.InProgress,
      });
      try {
        const params: JourneyStatsRequest = {
          workspaceId: args.workspaceId,
          journeyIds: args.journeyIds,
        };
        const response = await axios.get(`${baseApiUrl}/journeys/stats`, {
          params,
          headers: authHeaders,
        });
        const value = unwrap(
          schemaValidateWithErr(response.data, JourneyStatsResponse),
        );

        args.setJourneyStatsRequest({
          type: CompletionStatus.NotStarted,
        });
        args.upsertJourneyStats(value);
      } catch (e) {
        const error = e as Error;

        console.error(e);
        args.setJourneyStatsRequest({
          type: CompletionStatus.Failed,
          error,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
