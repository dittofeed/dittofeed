import { Type } from "@sinclair/typebox";
import config from "backend-lib/src/config";
import { FastifyRequest } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

const withWorkspaceId = Type.Object({
  workspaceId: Type.String(),
});

export function getWorkspaceIdFromReq(req: FastifyRequest): string {
  const bodyParam = schemaValidate(req.body, withWorkspaceId).unwrapOr(
    null
  )?.workspaceId;
  if (bodyParam) {
    return bodyParam;
  }

  const queryParam = schemaValidate(req.query, withWorkspaceId).unwrapOr(
    null
  )?.workspaceId;
  if (queryParam) {
    return queryParam;
  }

  const header = req.headers[WORKSPACE_ID_HEADER];

  if (header instanceof Array && header[0]) {
    return header[0];
  }
  if (header && typeof header === "string") {
    return header;
  }

  return config().defaultWorkspaceId;
}
