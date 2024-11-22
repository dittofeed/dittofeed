import { Type } from "@sinclair/typebox";
import backendConfig from "backend-lib/src/config";
import prisma from "backend-lib/src/prisma";
import { FastifyRequest } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { WorkspaceIdentifier } from "isomorphic-lib/src/types";
import { err, ok, Result } from "neverthrow";
import { validate as validateUuid } from "uuid";

const withWorkspaceId = Type.Object({
  workspaceId: Type.String(),
});

const withExternalId = Type.Object({
  externalId: Type.String(),
});

export enum GetWorkspaceIdentifierErrorType {
  MismatchedWorkspaceIds = "MismatchedWorkspaceIds",
  InvalidWorkspaceId = "InvalidWorkspaceId",
}

export interface GetWorkspaceIdentifierError {
  type: GetWorkspaceIdentifierErrorType;
  message: string;
}

export function getWorkspaceIdFromReq(
  req: FastifyRequest,
): Result<string | null, GetWorkspaceIdentifierError> {
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
      type: GetWorkspaceIdentifierErrorType.MismatchedWorkspaceIds,
      message: "Mismatched workspaceIds in request.",
    });
  }
  const [workspaceId] = workspaceIdValues;
  if (!workspaceId) {
    return ok(null);
  }
  if (!validateUuid(workspaceId)) {
    return err({
      type: GetWorkspaceIdentifierErrorType.InvalidWorkspaceId,
      message: "Invalid workspaceId, not a valid UUID.",
    });
  }
  return ok(workspaceId);
}

export async function getWorkspaceId(
  req: FastifyRequest,
): Promise<Result<string | null, GetWorkspaceIdentifierError>> {
  const result = getWorkspaceIdFromReq(req);
  if (result.isErr()) {
    return result;
  }
  const workspaceId = result.value;
  if (workspaceId) {
    return ok(workspaceId);
  }

  if (backendConfig().authMode === "multi-tenant") {
    return ok(null);
  }

  return ok((await prisma().workspace.findFirstOrThrow()).id);
}

export function getExternalIdFromReq(
  req: FastifyRequest,
): Result<string | null, GetWorkspaceIdentifierError> {
  const externalIdSources: unknown[] = [req.query];
  const externalIdValues: string[] = [];

  for (const source of externalIdSources) {
    const result = schemaValidate(source, withExternalId);
    if (result.isOk()) {
      externalIdValues.push(result.value.externalId);
    }
  }

  const distinctValues = new Set(externalIdValues);
  if (distinctValues.size > 1) {
    return err({
      type: GetWorkspaceIdentifierErrorType.MismatchedWorkspaceIds,
      message: "Mismatched externalIds in request.",
    });
  }
  const [externalId] = externalIdValues;
  if (!externalId) {
    return ok(null);
  }
  return ok(externalId);
}

export async function getWorkspaceIdentifier(
  req: FastifyRequest,
): Promise<Result<WorkspaceIdentifier | null, GetWorkspaceIdentifierError>> {
  const workspaceResult = getWorkspaceIdFromReq(req);
  if (workspaceResult.isErr()) {
    return err(workspaceResult.error);
  }
  const workspaceId = workspaceResult.value;
  if (workspaceId) {
    return ok({ workspaceId });
  }

  const externalIdResult = getExternalIdFromReq(req);
  if (externalIdResult.isErr()) {
    return err(externalIdResult.error);
  }
  const externalId = externalIdResult.value;
  if (externalId) {
    return ok({ externalId });
  }

  if (backendConfig().authMode === "multi-tenant") {
    return ok(null);
  }

  return ok({ workspaceId: (await prisma().workspace.findFirstOrThrow()).id });
}
