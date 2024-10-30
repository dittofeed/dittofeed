import { Type } from "@sinclair/typebox";
import { FastifyRequest } from "fastify";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { err, ok, Result } from "neverthrow";

import backendConfig from "./config";
import prisma from "./prisma";

const withWorkspaceId = Type.Object({
  workspaceId: Type.String(),
});

export enum GetWorkspaceIdErrorType {
  MismatchedWorkspaceIds = "MismatchedWorkspaceIds",
}

export interface GetWorkspaceIdError {
  type: GetWorkspaceIdErrorType;
  message: string;
}

export function getWorkspaceIdFromReq(
  req: FastifyRequest,
): Result<string | null, GetWorkspaceIdError> {
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
  return ok(null);
}

export async function getWorkspaceId(
  req: FastifyRequest,
): Promise<Result<string | null, GetWorkspaceIdError>> {
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
