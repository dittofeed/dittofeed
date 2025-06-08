import { ReactFlowProvider } from "@xyflow/react";

import JourneysBuilder from "../journeysBuilder";
import { useJourneyV2Context } from "./shared";

export default function JourneyV2Editor() {
  const { state } = useJourneyV2Context();
  return (
    <ReactFlowProvider>
      <JourneysBuilder journeyId={state.id} />
    </ReactFlowProvider>
  );
}
