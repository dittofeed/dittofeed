import { and, eq } from "drizzle-orm";
import { err, ok, Result } from "neverthrow";

import { db, PostgresError, QueryError, queryResult } from "./db";
import { componentConfiguration as dbComponentConfiguration } from "./db/schema";
import logger from "./logger";
import {
  ComponentConfiguration,
  ComponentConfigurationDefinition,
  ComponentConfigurationResource,
  DeleteComponentConfigurationRequest,
  UpsertComponentConfigurationRequest,
  UpsertComponentConfigurationValidationError,
  UpsertComponentConfigurationValidationErrorType,
} from "./types";

export async function upsertComponentConfiguration(
  params: UpsertComponentConfigurationRequest,
): Promise<
  Result<
    ComponentConfigurationResource,
    UpsertComponentConfigurationValidationError
  >
> {
  const { id, name, workspaceId, definition } = params;
  let result: Result<ComponentConfiguration[], QueryError>;
  const shouldUpsert = !!definition;
  // if definition is provided we have enough information to create or update
  if (shouldUpsert) {
    logger().debug(
      {
        id,
        name,
        workspaceId,
        definition,
      },
      "upserting component configuration",
    );
    result = await queryResult(
      db()
        .insert(dbComponentConfiguration)
        .values({
          id,
          name,
          workspaceId,
          definition,
        })
        .onConflictDoUpdate({
          target: id
            ? [dbComponentConfiguration.id]
            : [
                dbComponentConfiguration.name,
                dbComponentConfiguration.workspaceId,
              ],
          set: {
            name,
            definition,
          },
          setWhere: eq(dbComponentConfiguration.workspaceId, workspaceId),
        })
        .returning(),
    );
    // if no definition, we are updating the name
  } else if (id) {
    result = await queryResult(
      db()
        .update(dbComponentConfiguration)
        .set({
          name,
        })
        .where(
          and(
            eq(dbComponentConfiguration.id, id),
            eq(dbComponentConfiguration.workspaceId, workspaceId),
          ),
        )
        .returning(),
    );
    // if neither id nor definition, we just lookup the existing config, because
    // there's nothing to create or update
  } else {
    result = ok(
      await db().query.componentConfiguration.findMany({
        where: and(
          eq(dbComponentConfiguration.workspaceId, workspaceId),
          eq(dbComponentConfiguration.name, name),
        ),
      }),
    );
  }
  if (result.isOk()) {
    const [config] = result.value;
    if (!config) {
      logger().debug(
        {
          name,
          workspaceId,
        },
        "component configuration not found",
      );
      if (shouldUpsert) {
        return err({
          type: UpsertComponentConfigurationValidationErrorType.UniqueConstraintViolation,
          message:
            "Names must be unique in workspace. Id's must be globally unique.",
        });
      }
      return err({
        type: UpsertComponentConfigurationValidationErrorType.NotFound,
        message: "Tried to update a non-existent component configuration",
      });
    }
    return ok({
      id: config.id,
      name: config.name,
      workspaceId: config.workspaceId,
      definition: config.definition as ComponentConfigurationDefinition,
    });
  }

  if (
    result.error.code === PostgresError.FOREIGN_KEY_VIOLATION ||
    result.error.code === PostgresError.UNIQUE_VIOLATION
  ) {
    logger().debug(
      {
        name,
        workspaceId,
      },
      "unique constraint violation",
    );
    return err({
      type: UpsertComponentConfigurationValidationErrorType.UniqueConstraintViolation,
      message:
        "Names must be unique in workspace. Id's must be globally unique.",
    });
  }

  throw result.error;
}

export async function deleteComponentConfiguration(
  _deleteComponentConfigurationRequest: DeleteComponentConfigurationRequest,
): Promise<void> {
  throw new Error("Not implemented");
}
