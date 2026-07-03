import { JourneyType, JourneyTypeEnum } from "isomorphic-lib/src/types";

import config from "../config";

export function getJourneyTaskQueue(journeyType?: JourneyType): string {
  switch (journeyType) {
    case JourneyTypeEnum.Transactional:
      return config().transactionalTaskQueue;
    case JourneyTypeEnum.BulkMarketing:
      return config().bulkMarketingTaskQueue;
    case JourneyTypeEnum.Marketing:
    default:
      return config().userJourneyTaskQueue;
  }
}
