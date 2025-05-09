import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  JourneyStatsRequest,
  JourneyStatsResponse,
} from "isomorphic-lib/src/types";
import React from "react";

import { useAppStorePick } from "./appStore";
import { useAuthHeaders, useBaseApiUrl } from "./authModeProvider";
import { AppContents } from "./types";

export function useJourneyStats(
  args: Partial<Omit<JourneyStatsRequest, "workspaceId">> &
    Pick<AppContents, "upsertJourneyStats" | "setJourneyStatsRequest">,
) {
  const { workspace } = useAppStorePick(["workspace"]);
  const authHeaders = useAuthHeaders();
  const baseApiUrl = useBaseApiUrl();

  React.useEffect(() => {
    (async () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      const workspaceId = workspace.value.id;
      args.setJourneyStatsRequest({
        type: CompletionStatus.InProgress,
      });
      try {
        const params: JourneyStatsRequest = {
          workspaceId,
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
