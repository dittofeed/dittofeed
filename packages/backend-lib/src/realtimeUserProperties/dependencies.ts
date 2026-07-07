import { fileUserPropertyToPerformed } from "isomorphic-lib/src/userProperties";

import {
  EventType,
  GroupChildrenUserPropertyDefinitions,
  JSONValue,
  SavedUserPropertyResource,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "../types";
import { findAllUserPropertyResources } from "../userProperties";

export interface RealtimeUserPropertyDependencies {
  alwaysUserPropertyIds: Set<string>;
  eventNames: Set<string>;
  traitPaths: Set<string>;
  userProperties: SavedUserPropertyResource[];
  userPropertiesByEventName: Map<string, Set<string>>;
  userPropertiesByTraitPath: Map<string, Set<string>>;
}

export interface RealtimeUserPropertyJob {
  anonymousId?: string;
  event?: string;
  eventTime: Date;
  eventType: string;
  messageId: string;
  payload: Record<string, JSONValue>;
  processingTime?: Date;
  userId?: string;
  userOrAnonymousId: string;
  workspaceId: string;
}

const CACHE_MAX_SIZE = 1_000;
const CACHE_TTL_MS = 30_000;

interface CachedDependencies {
  dependencies: RealtimeUserPropertyDependencies;
  expiresAt: number;
}

const CACHE = new Map<string, CachedDependencies>();

function addToIndex(
  index: Map<string, Set<string>>,
  key: string,
  userPropertyId: string,
): void {
  const ids = index.get(key) ?? new Set<string>();
  ids.add(userPropertyId);
  index.set(key, ids);
}

function collectDefinitionDependencies({
  definition,
  dependencies,
  userPropertyId,
}: {
  definition: UserPropertyDefinition | GroupChildrenUserPropertyDefinitions;
  dependencies: RealtimeUserPropertyDependencies;
  userPropertyId: string;
}): void {
  switch (definition.type) {
    case UserPropertyDefinitionType.Trait:
      dependencies.traitPaths.add(definition.path);
      addToIndex(
        dependencies.userPropertiesByTraitPath,
        definition.path,
        userPropertyId,
      );
      return;
    case UserPropertyDefinitionType.Performed:
    case UserPropertyDefinitionType.KeyedPerformed:
      dependencies.eventNames.add(definition.event);
      addToIndex(
        dependencies.userPropertiesByEventName,
        definition.event,
        userPropertyId,
      );
      return;
    case UserPropertyDefinitionType.File: {
      const performed = fileUserPropertyToPerformed({
        userProperty: definition,
      });
      dependencies.eventNames.add(performed.event);
      addToIndex(
        dependencies.userPropertiesByEventName,
        performed.event,
        userPropertyId,
      );
      return;
    }
    case UserPropertyDefinitionType.PerformedMany:
      for (const event of definition.or) {
        dependencies.eventNames.add(event.event);
        addToIndex(
          dependencies.userPropertiesByEventName,
          event.event,
          userPropertyId,
        );
      }
      return;
    case UserPropertyDefinitionType.Id:
    case UserPropertyDefinitionType.AnonymousId:
      dependencies.alwaysUserPropertyIds.add(userPropertyId);
      return;
    case UserPropertyDefinitionType.Group:
      for (const node of definition.nodes) {
        collectDefinitionDependencies({
          definition: node,
          dependencies,
          userPropertyId,
        });
      }
      break;
    case UserPropertyDefinitionType.AnyOf:
      break;
  }
}

function buildDependencies(
  userProperties: SavedUserPropertyResource[],
): RealtimeUserPropertyDependencies {
  const dependencies: RealtimeUserPropertyDependencies = {
    alwaysUserPropertyIds: new Set(),
    eventNames: new Set(),
    traitPaths: new Set(),
    userProperties,
    userPropertiesByEventName: new Map(),
    userPropertiesByTraitPath: new Map(),
  };
  for (const userProperty of userProperties) {
    collectDefinitionDependencies({
      definition: userProperty.definition,
      dependencies,
      userPropertyId: userProperty.id,
    });
  }
  return dependencies;
}

function setCachedDependencies({
  dependencies,
  workspaceId,
}: {
  dependencies: RealtimeUserPropertyDependencies;
  workspaceId: string;
}): void {
  if (CACHE.has(workspaceId)) {
    CACHE.delete(workspaceId);
  } else if (CACHE.size >= CACHE_MAX_SIZE) {
    const lruKey = CACHE.keys().next().value;
    if (lruKey) {
      CACHE.delete(lruKey);
    }
  }
  CACHE.set(workspaceId, {
    dependencies,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function clearRealtimeUserPropertyDependencyCache(): void {
  CACHE.clear();
}

export async function getCachedRealtimeUserPropertyDependencies({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<RealtimeUserPropertyDependencies> {
  const cached = CACHE.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    CACHE.delete(workspaceId);
    CACHE.set(workspaceId, cached);
    return cached.dependencies;
  }
  if (cached) {
    CACHE.delete(workspaceId);
  }
  const userProperties = await findAllUserPropertyResources({
    workspaceId,
    requireRunning: true,
  });
  const dependencies = buildDependencies(userProperties);
  setCachedDependencies({ dependencies, workspaceId });
  return dependencies;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JSONValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }
  return false;
}

function asRecord(value: unknown): Record<string, JSONValue> {
  if (!isRecord(value)) {
    return {};
  }
  const record: Record<string, JSONValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isJsonValue(item)) {
      record[key] = item;
    }
  }
  return record;
}

export function doesJobAffectUserPropertyDependencies({
  dependencies,
  job,
}: {
  dependencies: RealtimeUserPropertyDependencies;
  job: RealtimeUserPropertyJob;
}): boolean {
  if (dependencies.alwaysUserPropertyIds.size > 0) {
    return true;
  }
  if (job.eventType === String(EventType.Identify)) {
    const traits = asRecord(job.payload.traits);
    return Object.keys(traits).some((path) =>
      dependencies.traitPaths.has(path),
    );
  }
  if (job.event) {
    return [...dependencies.eventNames].some((eventName) => {
      if (eventName.endsWith("*")) {
        return job.event?.startsWith(eventName.slice(0, -1));
      }
      return eventName === "*" || eventName === job.event;
    });
  }
  return false;
}
