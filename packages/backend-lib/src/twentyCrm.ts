import axios from "axios";
import {
  ValidateTwentyCrmApiKeyRequest,
  ValidateTwentyCrmApiKeyResponse,
} from "isomorphic-lib/src/types";

import config from "./config";
import logger from "./logger";
import { PeopleApi } from "./twentyCrm/coreClient/api/people-api";
import { Configuration } from "./twentyCrm/coreClient/configuration";

export async function validateTwentyCrmApiKey(
  request: ValidateTwentyCrmApiKeyRequest,
): Promise<ValidateTwentyCrmApiKeyResponse> {
  const { twentyCrmUrl } = config();
  if (!twentyCrmUrl) {
    logger().error("TwentyCRM URL is not set");
    return {
      success: false,
    };
  }
  const configuration = new Configuration({
    accessToken: request.apiKey,
    basePath: twentyCrmUrl,
  });
  const peopleApi = new PeopleApi(configuration);
  try {
    await peopleApi.findManyPeople(undefined, undefined, 1);
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      return {
        success: false,
      };
    }
    logger().error(
      {
        err: e,
      },
      "Failed to connect to TwentyCRM",
    );
    throw new Error("Failed to connect to TwentyCRM");
  }
  return {
    success: true,
  };
}
