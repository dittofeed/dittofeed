import { useMemo } from "react";
import { useImmer } from "use-immer";

import JourneyV2Layout from "./v2/layout";
import {
  JourneyV2Context,
  JourneyV2State,
  JourneyV2StepKeys,
} from "./v2/shared";

export default function JourneyV2({ id }: { id: string }) {
  const [state, setState] = useImmer<JourneyV2State>({
    id,
    step: JourneyV2StepKeys.EDITOR,
  });
  const context = useMemo(() => ({ state, setState }), [state, setState]);
  return (
    <JourneyV2Context.Provider value={context}>
      <JourneyV2Layout>
        <div>JourneyV2</div>
      </JourneyV2Layout>
    </JourneyV2Context.Provider>
  );
}
