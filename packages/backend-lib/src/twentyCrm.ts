import axios from "axios";
import { SecretNames } from "isomorphic-lib/src/constants";
import {
  CreateAdminApiKeyRequest,
  CreateCustomSegmentObjectError,
  CreateCustomSegmentObjectErrorTypeEnum,
  CreateCustomSegmentObjectResponse,
  ValidateTwentyCrmApiKeyRequest,
  ValidateTwentyCrmApiKeyResponse,
} from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";

import config from "./config";
import logger from "./logger";
import { getSecretValue } from "./secrets";
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

export async function createCustomSegmentObject(
  params: CreateAdminApiKeyRequest,
): Promise<
  Result<CreateCustomSegmentObjectResponse, CreateCustomSegmentObjectError>
> {
  const { twentyCrmUrl } = config();
  if (!twentyCrmUrl) {
    throw new Error("TwentyCRM URL is not set");
  }
  const apiKey = await getSecretValue({
    workspaceId: params.workspaceId,
    name: SecretNames.TwentyCrmApiKey,
  });
  if (!apiKey) {
    return err({
      type: CreateCustomSegmentObjectErrorTypeEnum.InvalidApiKey,
      message: "API key not found",
    });
  }
  // TODO use meta api to create custom segment object
  return ok({
    success: true,
  });
}
