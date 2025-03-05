import { SpanStatusCode } from "@opentelemetry/api";
import { and, eq, or } from "drizzle-orm";
import { IncomingHttpHeaders } from "http";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok } from "neverthrow";
import { sortBy } from "remeda";

import { decodeJwtHeader } from "./auth";
import config from "./config";
import { db } from "./db";
import {
  workspace as dbWorkspace,
  workspaceMembeAccount as dbWorkspaceMembeAccount,
  workspaceMember as dbWorkspaceMember,
  workspaceMemberRole as dbWorkspaceMemberRole,
} from "./db/schema";
import logger from "./logger";
import { withSpan } from "./openTelemetry";
import { requestContextPostProcessor } from "./requestContextPostProcessor";
import {
  NotOnboardedError,
  OpenIdProfile,
  RequestContextErrorType,
  RequestContextResult,
  WorkspaceMember,
  WorkspaceMemberResource,
  WorkspaceMemberRoleResource,
  WorkspaceResource,
  WorkspaceStatusDb,
  WorkspaceStatusDbEnum,
} from "./types";

export const SESSION_KEY = "df-session-key";

interface RolesWithWorkspace {
  workspace:
    | (WorkspaceResource & {
        status: WorkspaceStatusDb;
      })
    | null;
  memberRoles: WorkspaceMemberRoleResource[];
}

async function findAndCreateRoles(
  member: WorkspaceMember,
): Promise<RolesWithWorkspace> {
  const domain = member.email?.split("@")[1];

  const workspaces = await db()
    .select()
    .from(dbWorkspace)
    .leftJoin(
      dbWorkspaceMemberRole,
      and(
        eq(dbWorkspaceMemberRole.workspaceId, dbWorkspace.id),
        eq(dbWorkspaceMemberRole.workspaceMemberId, member.id),
      ),
    )
    .where(
      and(
        eq(dbWorkspace.status, WorkspaceStatusDbEnum.Active),
        or(
          eq(dbWorkspaceMemberRole.workspaceMemberId, member.id),
          domain ? eq(dbWorkspace.domain, domain) : undefined,
        ),
      ),
    );

  const domainWorkspacesWithoutRole = workspaces.filter(
    (w) => w.WorkspaceMemberRole === null,
  );
  let roles = workspaces.flatMap((w) => w.WorkspaceMemberRole ?? []);
  if (domainWorkspacesWithoutRole.length !== 0) {
    const newRoles = (
      await Promise.all(
        domainWorkspacesWithoutRole.map((w) =>
          db()
            .insert(dbWorkspaceMemberRole)
            .values({
              workspaceId: w.Workspace.id,
              workspaceMemberId: member.id,
              role: "Admin",
            })
            .onConflictDoNothing()
            .returning(),
        ),
      )
    ).flat();
    logger().debug(
      {
        newRoles,
      },
      "new roles",
    );
    for (const role of newRoles) {
      roles.push(role);
    }
  }
  const workspaceById = workspaces.reduce((acc, w) => {
    acc.set(w.Workspace.id, w.Workspace);
    return acc;
  }, new Map<string, WorkspaceResource>());

  const memberRoles = roles.flatMap((r) => {
    const workspace = workspaceById.get(r.workspaceId);
    if (!workspace) {
      return [];
    }

    return {
      workspaceId: r.workspaceId,
      role: r.role,
      workspaceMemberId: member.id,
      workspaceName: workspace.name,
    };
  });

  if (member.lastWorkspaceId) {
    const lastWorkspaceRole = roles.find(
      (r) => r.workspaceId === member.lastWorkspaceId,
    );
    const workspace = workspaces.find(
      (w) => w.Workspace.id === member.lastWorkspaceId,
    )?.Workspace;
    if (lastWorkspaceRole && workspace) {
      return { memberRoles, workspace };
    }
  }

  roles = sortBy(roles, (r) => r.createdAt.getTime());
  const role = roles[0];
  if (!role) {
    logger().debug(
      {
        roles,
      },
      "missing role",
    );
    return {
      memberRoles,
      workspace: null,
    };
  }
  const workspace = workspaces.find(
    (w) => w.Workspace.id === role.workspaceId,
  )?.Workspace;

  if (!workspace) {
    logger().debug(
      {
        role,
        workspaces,
      },
      "missing workspace no role found",
    );
    return {
      memberRoles,
      workspace: null,
    };
  }
  return {
    memberRoles,
    workspace,
  };
}

export async function getMultiTenantRequestContext({
  authorizationToken,
  authProvider,
  profile: profileFromContext,
}: {
  authorizationToken: string | null;
  authProvider?: string;
  profile?: OpenIdProfile;
}): Promise<RequestContextResult> {
  if (!authProvider) {
    return err({
      type: RequestContextErrorType.ApplicationError,
      message: "Misconfigured auth provider, missing.",
    });
  }

  let profile: OpenIdProfile;
  if (profileFromContext) {
    profile = profileFromContext;
  } else {
    if (!authorizationToken) {
      return err({
        type: RequestContextErrorType.ApplicationError,
        message: "authorizationToken is missing",
      });
    }
    const decodedJwt = decodeJwtHeader(authorizationToken);

    if (!decodedJwt) {
      return err({
        type: RequestContextErrorType.NotAuthenticated,
        message: "Unable to decode jwt",
      });
    }
    profile = decodedJwt;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { sub, email, picture, email_verified, name, nickname } = profile;

  if (!email_verified) {
    return err({
      type: RequestContextErrorType.EmailNotVerified,
      email,
    });
  }

  // eslint-disable-next-line prefer-const
  let [existingMember, account] = await Promise.all([
    db().query.workspaceMember.findFirst({
      where: eq(dbWorkspaceMember.email, email),
      with: {
        workspaceMemberRoles: {
          limit: 1,
          with: {
            workspace: true,
          },
        },
      },
    }),
    db().query.workspaceMembeAccount.findFirst({
      where: and(
        eq(dbWorkspaceMembeAccount.provider, authProvider),
        eq(dbWorkspaceMembeAccount.providerAccountId, sub),
      ),
    }),
  ]);

  let member: WorkspaceMember;
  if (
    !existingMember ||
    existingMember.emailVerified !== email_verified ||
    existingMember.image !== picture
  ) {
    const [updatedMember] = await db()
      .insert(dbWorkspaceMember)
      .values({
        id: existingMember?.id,
        email,
        emailVerified: email_verified,
        image: picture,
        name,
        nickname,
      })
      .onConflictDoUpdate({
        target: existingMember
          ? [dbWorkspaceMember.id]
          : [dbWorkspaceMember.email],
        set: {
          emailVerified: email_verified,
          image: picture,
          name,
          nickname,
        },
      })
      .returning();
    if (!updatedMember) {
      logger().error("Failed to update member", {
        email,
        email_verified,
        picture,
        name,
        nickname,
      });
      return err({
        type: RequestContextErrorType.ApplicationError,
        message: "Failed to update member",
      });
    }
    member = updatedMember;
  } else {
    member = existingMember;
  }

  if (!account) {
    await db()
      .insert(dbWorkspaceMembeAccount)
      .values({
        provider: authProvider,
        providerAccountId: sub,
        workspaceMemberId: member.id,
      })
      .onConflictDoNothing();
  }
  if (!member.email) {
    return err({
      type: RequestContextErrorType.ApplicationError,
      message: "User missing email",
    });
  }

  const { workspace, memberRoles } = await findAndCreateRoles(member);
  if (workspace !== null && workspace.status !== WorkspaceStatusDbEnum.Active) {
    return err({
      type: RequestContextErrorType.WorkspaceInactive,
      message: "Workspace is not active",
      workspace,
    });
  }
  const memberResouce: WorkspaceMemberResource = {
    id: member.id,
    email: member.email,
    emailVerified: member.emailVerified,
    name: member.name ?? undefined,
    nickname: member.nickname ?? undefined,
    picture: member.image ?? undefined,
    createdAt: member.createdAt.toISOString(),
  };

  if (!workspace) {
    return err({
      type: RequestContextErrorType.NotOnboarded,
      message: "User missing role",
      member: memberResouce,
      memberRoles,
    } satisfies NotOnboardedError);
  }

  return ok({
    member: memberResouce,
    workspace,
    memberRoles,
  });
}

async function getAnonymousRequestContext(): Promise<RequestContextResult> {
  const workspace = await db().query.workspace.findFirst();
  if (!workspace) {
    return err({
      type: RequestContextErrorType.ApplicationError,
      message: `Workspace not found`,
    });
  }
  return ok({
    workspace: {
      id: workspace.id,
      name: workspace.name,
    },
    member: {
      id: "anonymous",
      email: "anonymous@email.com",
      emailVerified: true,
      createdAt: new Date().toISOString(),
    },
    memberRoles: [
      {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceMemberId: "anonymous",
        role: "Admin",
      },
    ],
  });
}

export async function getRequestContext(
  headers: IncomingHttpHeaders,
  profile?: OpenIdProfile,
): Promise<RequestContextResult> {
  return withSpan({ name: "get-request-context" }, async (span) => {
    const { authMode } = config();
    let result: RequestContextResult;
    logger().debug(
      {
        authMode,
      },
      "loc5",
    );
    switch (authMode) {
      case "anonymous": {
        result = await getAnonymousRequestContext();
        break;
      }
      case "single-tenant": {
        if (headers[SESSION_KEY] !== "true") {
          return err({
            type: RequestContextErrorType.NotAuthenticated,
          });
        }
        result = await getAnonymousRequestContext();
        break;
      }
      case "multi-tenant": {
        const authorizationToken =
          headers.authorization && typeof headers.authorization === "string"
            ? headers.authorization
            : null;

        const postProcessorModule = await requestContextPostProcessor();
        result = await getMultiTenantRequestContext({
          authorizationToken,
          authProvider: config().authProvider,
          profile,
        });
        logger().debug(
          {
            result,
          },
          "loc4",
        );

        result = await postProcessorModule.postProcessor(result);
        break;
      }
    }
    if (result.isOk()) {
      const { id: memberId, email: memberEmail } = result.value.member;
      const { id: workspaceId, name: workspaceName } = result.value.workspace;

      const memberRoles = result.value.memberRoles.flatMap((r) =>
        r.workspaceId === workspaceId ? r.role : [],
      );
      span.setAttributes({
        memberId,
        memberEmail,
        workspaceId,
        workspaceName,
        memberRoles,
      });
      return result;
    }
    switch (result.error.type) {
      // TODO handle when users can request access to a workspace that they
      // currently are not authorized to access
      case RequestContextErrorType.Unauthorized: {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error.message,
        });
        span.setAttributes({
          type: result.error.type,
          memberEmail: result.error.member.email,
          memberId: result.error.member.id,
          workspaceId: result.error.workspace.id,
          workspaceName: result.error.workspace.name,
        });
        break;
      }
      case RequestContextErrorType.NotOnboarded: {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error.message,
        });
        span.setAttributes({
          type: result.error.type,
          memberEmail: result.error.member.email,
          memberId: result.error.member.id,
        });
        break;
      }
      case RequestContextErrorType.ApplicationError: {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error.message,
        });
        span.setAttributes({
          type: result.error.type,
        });
        break;
      }
      case RequestContextErrorType.EmailNotVerified: {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error.type,
        });
        span.setAttributes({
          type: result.error.type,
          email: result.error.email,
        });
        break;
      }
      case RequestContextErrorType.NotAuthenticated: {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error.type,
        });
        span.setAttributes({
          type: result.error.type,
        });
        break;
      }
      case RequestContextErrorType.WorkspaceInactive: {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: result.error.message,
        });
        span.setAttributes({
          type: result.error.type,
          workspaceId: result.error.workspace.id,
          workspaceName: result.error.workspace.name,
        });
        break;
      }
      default:
        assertUnreachable(result.error);
    }
    return result;
  });
}
