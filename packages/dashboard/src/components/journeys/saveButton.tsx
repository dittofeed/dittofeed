import { Button } from "@mui/material";
import {
  CompletionStatus,
  JourneyResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";
import React from "react";

import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import { journeyDefinitionFromState } from "./store";

// Only usable on SSR pages
export default function SaveButton({ journeyId }: { journeyId: string }) {
  const journeyUpdateRequest = useAppStore(
    (store) => store.journeyUpdateRequest
  );
  const setJourneyUpdateRequest = useAppStore(
    (store) => store.setJourneyUpdateRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const upsertJourney = useAppStore((store) => store.upsertJourney);

  const journeyEdges = useAppStore((store) => store.journeyEdges);
  const journeyNodes = useAppStore((store) => store.journeyNodes);
  const journeyNodesIndex = useAppStore((store) => store.journeyNodesIndex);
  const journeyName = useAppStore((store) => store.journeyName);
  const workspace = useAppStore((store) => store.workspace);

  const handleSave = () => {
    const journeyDefinition = journeyDefinitionFromState({
      state: {
        journeyEdges,
        journeyNodes,
        journeyNodesIndex,
      },
    });
    if (workspace.type !== CompletionStatus.Successful) {
      console.error("workspace not available");
      return;
    }

    if (journeyDefinition.isErr()) {
      console.error(
        "failed to build journey definition",
        journeyDefinition.error
      );
      return;
    }

    const journeyUpdate: UpsertJourneyResource = {
      id: journeyId,
      workspaceId: workspace.value.id,
      definition: journeyDefinition.value,
      name: journeyName,
    };
    apiRequestHandlerFactory({
      request: journeyUpdateRequest,
      setRequest: setJourneyUpdateRequest,
      responseSchema: JourneyResource,
      setResponse: upsertJourney,
      onSuccessNotice: `Saved journey ${journeyName}.`,
      onFailureNoticeHandler: () =>
        `API Error: Failed to save journey ${journeyName}.`,
      requestConfig: {
        method: "PUT",
        url: `${apiBase}/api/journeys`,
        data: journeyUpdate,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  };

  return (
    <Button variant="contained" onClick={handleSave}>
      Save
    </Button>
  );
}
