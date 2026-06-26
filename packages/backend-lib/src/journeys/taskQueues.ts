import { JourneyType, JourneyTypeEnum } from "isomorphic-lib/src/types";

import config from "../config";

export function getJourneyTaskQueue(journeyType?: JourneyType): string {
  return journeyType === JourneyTypeEnum.Transactional
    ? config().transactionalTaskQueue
    : config().userJourneyTaskQueue;
}
