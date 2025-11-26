import { SavedJourneyResource } from "isomorphic-lib/src/types";
import { useEffect, useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../../lib/appStore";
import {
  JourneyUpdate,
  useJourneyMutation,
} from "../../lib/useJourneyMutation";
import { useJourneyQuery } from "../../lib/useJourneyQuery";
import useOnceWhen from "../../lib/useOnceWhen";
import {
  journeyResourceToState,
  journeyStateToDraft,
  shouldDraftBeUpdated,
} from "./store";
import JourneyV2Editor from "./v2/editor";
import JourneyV2Layout from "./v2/layout";
import {
  JourneyV2Context,
  JourneyV2State,
  JourneyV2StepKeys,
} from "./v2/shared";
import JourneyV2Summary from "./v2/summary";

export default function JourneyV2({ id }: { id: string }) {
  const [state, setState] = useImmer<JourneyV2State>({
    id,
    step: JourneyV2StepKeys.EDITOR,
  });
  const {
    initJourneyState,
    viewDraft,
    journeyEdges,
    journeyNodes,
    journeyNodesIndex,
  } = useAppStorePick([
    "initJourneyState",
    "viewDraft",
    "journeyEdges",
    "journeyNodes",
    "journeyNodesIndex",
  ]);

  const context = useMemo(() => ({ state, setState }), [state, setState]);
  const { mutate: updateJourney } = useJourneyMutation(id);

  let content: React.ReactNode;
  switch (state.step) {
    case JourneyV2StepKeys.EDITOR:
      content = <JourneyV2Editor />;
      break;
    case JourneyV2StepKeys.SUMMARY:
      content = <JourneyV2Summary />;
  }
  const { data: journey } = useJourneyQuery(id);

  // Initialize journey.
  useOnceWhen(() => {
    if (!journey) {
      throw new Error("Impossible branch, journey is undefined");
    }
    // assume that definition and draft values were not excluded from the query
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const savedJourney = journey as SavedJourneyResource;
    const stateFromJourney = journeyResourceToState(savedJourney);
    initJourneyState(stateFromJourney);
  }, !!journey);

  // Update journey when draft changes.
  useEffect(() => {
    if (!journey || !viewDraft) {
      return;
    }
    if (
      !shouldDraftBeUpdated({
        definition: journey.definition,
        draft: journey.draft,
        journeyEdges,
        journeyNodes,
        journeyNodesIndex,
      })
    ) {
      return;
    }
    const upsertPayload: JourneyUpdate = {
      name: journey.name,
      draft: journeyStateToDraft({
        journeyEdges,
        journeyNodes,
      }),
    };
    updateJourney(upsertPayload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey, journeyEdges, journeyNodes, journeyNodesIndex, viewDraft]);

  return (
    <JourneyV2Context.Provider value={context}>
      <JourneyV2Layout>{content}</JourneyV2Layout>
    </JourneyV2Context.Provider>
  );
}
