import { Button } from "@mui/material";
import axios, { AxiosResponse } from "axios";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  JourneyResource,
  UpsertJourneyResource,
} from "isomorphic-lib/src/types";
import getConfig from "next/config";

import { useAppStore } from "../../lib/appStore";
import { journeyDefinitionFromState } from "./store";

const { publicRuntimeConfig } = getConfig();

export default function SaveButton({ journeyId }: { journeyId: string }) {
  const journeyUpdateRequest = useAppStore(
    (store) => store.journeyUpdateRequest
  );
  const setJourneyUpdateRequest = useAppStore(
    (store) => store.setJourneyUpdateRequest
  );
  const upsertJourney = useAppStore((store) => store.upsertJourney);

  const journeyEdges = useAppStore((store) => store.journeyEdges);
  const journeyNodes = useAppStore((store) => store.journeyNodes);
  const journeyNodesIndex = useAppStore((store) => store.journeyNodesIndex);
  const journeyName = useAppStore((store) => store.journeyName);
  const workspace = useAppStore((store) => store.workspace);

  const handleSave = async () => {
    if (
      journeyUpdateRequest.type === CompletionStatus.InProgress ||
      workspace.type !== CompletionStatus.Successful
    ) {
      return;
    }

    const journeyDefinition = journeyDefinitionFromState({
      state: {
        journeyEdges,
        journeyNodes,
        journeyNodesIndex,
      },
    });

    // TODO add validation error message
    if (journeyDefinition.isErr()) {
      return;
    }

    const journeyUpdate: UpsertJourneyResource = {
      id: journeyId,
      workspaceId: workspace.value.id,
      definition: journeyDefinition.value,
      name: journeyName,
    };

    setJourneyUpdateRequest({
      type: CompletionStatus.InProgress,
    });

    let response: AxiosResponse;
    try {
      response = await axios.put(
        `${publicRuntimeConfig.apiBase}/api/journeys`,
        journeyUpdate,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } catch (e) {
      const error = e as Error;

      setJourneyUpdateRequest({
        type: CompletionStatus.Failed,
        error,
      });
      return;
    }

    const parsedResponse = schemaValidate(response.data, JourneyResource);
    if (parsedResponse.isErr()) {
      console.error("unable to parse response", parsedResponse.error);

      setJourneyUpdateRequest({
        type: CompletionStatus.Failed,
        error: new Error(JSON.stringify(parsedResponse.error)),
      });
      return;
    }

    upsertJourney(parsedResponse.value);
    setJourneyUpdateRequest({
      type: CompletionStatus.NotStarted,
    });
  };
  return (
    <Button variant="contained" onClick={handleSave}>
      Save
    </Button>
  );
}
