import { Type } from "@sinclair/typebox";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { FastifyRequest } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { Result } from "neverthrow";

const withWorkspaceId = Type.Object({
  workspaceId: Type.String(),
});

export function getWorkspaceIdFromReq(req: FastifyRequest): string | null {
  const bodyParam = schemaValidate(req.body, withWorkspaceId).unwrapOr(
    null,
  )?.workspaceId;
  if (bodyParam) {
    logger().debug({ workspaceId: bodyParam }, "Found workspaceId in body.");
    return bodyParam;
  }

  const queryParam = schemaValidate(req.query, withWorkspaceId).unwrapOr(
    null,
  )?.workspaceId;
  if (queryParam) {
    logger().debug({ workspaceId: queryParam }, "Found workspaceId in query.");
    return queryParam;
  }

  const header = req.headers[WORKSPACE_ID_HEADER];

  if (header instanceof Array && header[0]) {
    logger().debug({ workspaceId: header[0] }, "Found workspaceId in header.");
    return header[0];
  }
  if (header && typeof header === "string") {
    logger().debug({ workspaceId: header }, "Found workspaceId in header.");
    return header;
  }

  logger().debug("No workspaceId found in request.");
  return null;
}

export enum GetWorkspaceIdErrorType {
  MismatchedWorkspaceIds = "MismatchedWorkspaceIds",
}

export interface GetWorkspaceIdError {
  type: GetWorkspaceIdErrorType;
  message: string;
}

export async function getWorkspaceId(
  req: FastifyRequest,
): Promise<Result<string | null, GetWorkspaceIdError>> {
  const bodyParam = schemaValidate(req.body, withWorkspaceId).unwrapOr(
    null,
  )?.workspaceId;
  if (bodyParam) {
    logger().debug({ workspaceId: bodyParam }, "Found workspaceId in body.");
    return bodyParam;
  }

  const queryParam = schemaValidate(req.query, withWorkspaceId).unwrapOr(
    null,
  )?.workspaceId;
  if (queryParam) {
    logger().debug({ workspaceId: queryParam }, "Found workspaceId in query.");
    return queryParam;
  }

  const header = req.headers[WORKSPACE_ID_HEADER];

  if (header instanceof Array && header[0]) {
    logger().debug({ workspaceId: header[0] }, "Found workspaceId in header.");
    return header[0];
  }
  if (header && typeof header === "string") {
    logger().debug({ workspaceId: header }, "Found workspaceId in header.");
    return header;
  }

  logger().debug("No workspaceId found in request.");

  if (backendConfig().authMode === "multi-tenant") {
    return null;
  }
  return (await prisma().workspace.findFirstOrThrow()).id;
}
