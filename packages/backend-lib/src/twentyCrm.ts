import axios from "axios";
import {
  SecretNames,
  TWENTY_CRM_SEGMENT_OBJECT_FIELD_NAME,
  TWENTY_CRM_SEGMENT_OBJECT_NAME,
} from "isomorphic-lib/src/constants";
import {
  CreateCustomSegmentObjectError,
  CreateCustomSegmentObjectErrorTypeEnum,
  CreateCustomSegmentObjectRequest,
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
import { FieldsApi } from "./twentyCrm/metaClient/api/fields-api";
import { ObjectsApi } from "./twentyCrm/metaClient/api/objects-api";
import { Configuration as MetaConfiguration } from "./twentyCrm/metaClient/configuration";
import {
  Field,
  FieldForResponse,
  FieldTypeEnum,
  ModelObject,
  ObjectForResponse,
} from "./twentyCrm/metaClient/model";

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
    basePath: `${twentyCrmUrl}/rest/core`,
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
  params: CreateCustomSegmentObjectRequest,
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
  const metaConfiguration = new MetaConfiguration({
    accessToken: apiKey,
    basePath: `${twentyCrmUrl}/rest/metadata`,
  });
  logger().debug({ metaConfiguration }, "twentyCrm metaConfiguration");
  const objectsApi = new ObjectsApi(metaConfiguration);
  const fieldsApi = new FieldsApi(metaConfiguration);

  const segmentObjectName = TWENTY_CRM_SEGMENT_OBJECT_NAME;

  try {
    const { data: objects } = await objectsApi.objectsGet(1000);
    const personObject = objects.data?.objects?.find(
      (o: ObjectForResponse) => o.nameSingular === "person",
    );
    if (!personObject) {
      throw new Error("Could not find person object in TwentyCRM");
    }

    const existingSegmentObject = objects.data?.objects?.find(
      (o: ObjectForResponse) => o.nameSingular === segmentObjectName,
    );

    let segmentObject: ObjectForResponse;
    if (existingSegmentObject) {
      segmentObject = existingSegmentObject;
    } else {
      const newSegmentObject: ModelObject = {
        nameSingular: segmentObjectName,
        namePlural: `${segmentObjectName}s`,
        labelSingular: "Dittofeed Segment",
        labelPlural: "Dittofeed Segments",
        description: "A segment of users synced from Dittofeed.",
        icon: "fa-puzzle-piece",
      };
      const { data: createdObject } =
        await objectsApi.createOneObject(newSegmentObject);
      if (!createdObject.data?.createOneObject) {
        throw new Error("Could not create segment object in TwentyCRM");
      }
      segmentObject = createdObject.data.createOneObject;
    }

    const { data: fields } = await fieldsApi.fieldsGet();

    const segmentPeopleRelation = fields.data?.fields?.find(
      (f: FieldForResponse) =>
        f.objectMetadataId === segmentObject?.id &&
        f.name === TWENTY_CRM_SEGMENT_OBJECT_FIELD_NAME,
    );

    if (!segmentPeopleRelation) {
      if (!segmentObject.id) {
        throw new Error("Segment object does not have an ID.");
      }
      if (!personObject.id) {
        throw new Error("Person object does not have an ID.");
      }
      const newField: Field = {
        type: FieldTypeEnum.Relation,
        objectMetadataId: segmentObject.id,
        name: TWENTY_CRM_SEGMENT_OBJECT_FIELD_NAME,
        label: "People",
        description: "People in this segment.",
        isNullable: true,
        defaultValue: null,
        settings: {},

        relation: {
          relatedTo: personObject.id,
          // The cardinality of the relationship
          type: "ONE_TO_MANY",

          // The details for the new field on the Person object
          reverseRelation: {
            name: "dittofeedSegments", // A programmatic name
            label: "Dittofeed Segments", // A display label
          },
        },
      };
      await fieldsApi.createOneField(newField);
    }
  } catch (e) {
    logger().error({ err: e }, "Failed to create custom segment object");
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      return err({
        type: CreateCustomSegmentObjectErrorTypeEnum.InvalidApiKey,
        message: "API key is invalid.",
      });
    }
    throw e;
  }

  return ok({
    success: true,
  });
}
