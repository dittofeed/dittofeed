import { useMemo } from "react";
import { useImmer } from "use-immer";

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
  const context = useMemo(() => ({ state, setState }), [state, setState]);
  let content: React.ReactNode;
  switch (state.step) {
    case JourneyV2StepKeys.EDITOR:
      content = <JourneyV2Editor />;
      break;
    case JourneyV2StepKeys.SUMMARY:
      content = <JourneyV2Summary />;
  }
  // TODO: load initial state
  // - journeyName
  // - journeyEdges
  // - journeyNodes
  // - journeyNodesIndex
  // TODO use useQuery to load seconary resources
  // - segments
  // - user properties
  // - message templates
  // - subscription groups
  return (
    <JourneyV2Context.Provider value={context}>
      <JourneyV2Layout>{content}</JourneyV2Layout>
    </JourneyV2Context.Provider>
  );
}
