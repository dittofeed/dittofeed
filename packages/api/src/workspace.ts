import { Type } from "@sinclair/typebox";
import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import { FastifyRequest } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

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
  const workspaceIdSources: unknown[] = [req.body, req.query];
  const workspaceIdValues: string[] = [];

  for (const source of workspaceIdSources) {
    const result = schemaValidate(source, withWorkspaceId);
    if (result.isOk()) {
      workspaceIdValues.push(result.value.workspaceId);
    }
  }

  const workspaceIdHeader = req.headers[WORKSPACE_ID_HEADER];
  if (typeof workspaceIdHeader === "string") {
    workspaceIdValues.push(workspaceIdHeader);
  }

  const distinctValues = new Set(workspaceIdValues);
  if (distinctValues.size > 1) {
    return err({
      type: GetWorkspaceIdErrorType.MismatchedWorkspaceIds,
      message: "Mismatched workspaceIds in request.",
    });
  }
  const [workspaceId] = workspaceIdValues;
  if (workspaceId) {
    return ok(workspaceId);
  }

  if (backendConfig().authMode === "multi-tenant") {
    return ok(null);
  }

  return ok((await prisma().workspace.findFirstOrThrow()).id);
}
