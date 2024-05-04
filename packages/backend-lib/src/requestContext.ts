import { SpanStatusCode } from "@opentelemetry/api";
import { Prisma } from "@prisma/client";
import { IncomingHttpHeaders } from "http";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { err, ok, Result } from "neverthrow";
import { sortBy } from "remeda";

import { decodeJwtHeader } from "./auth";
import config from "./config";
import { withSpan } from "./openTelemetry";
import prisma from "./prisma";
import {
  DFRequestContext,
  OpenIdProfile,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberResource,
  WorkspaceMemberRole,
  WorkspaceMemberRoleResource,
  WorkspaceResource,
} from "./types";

export const SESSION_KEY = "df-session-key";

export enum RequestContextErrorType {
  Unauthorized = "Unauthorized",
  NotOnboarded = "NotOnboarded",
  EmailNotVerified = "EmailNotVerified",
  ApplicationError = "ApplicationError",
  NotAuthenticated = "NotAuthenticated",
}

export interface UnauthorizedError {
  type: RequestContextErrorType.Unauthorized;
  message: string;
  member: WorkspaceMemberResource;
  memberRoles: WorkspaceMemberRoleResource[];
  workspace: WorkspaceResource;
}

export interface NotOnboardedError {
  type: RequestContextErrorType.NotOnboarded;
  message: string;
  member: WorkspaceMemberResource;
  memberRoles: WorkspaceMemberRoleResource[];
}

export interface ApplicationError {
  type: RequestContextErrorType.ApplicationError;
  message: string;
}

export interface EmailNotVerifiedError {
  type: RequestContextErrorType.EmailNotVerified;
  email: string;
}

export interface NotAuthenticatedError {
  type: RequestContextErrorType.NotAuthenticated;
}

export type RequestContextError =
  | UnauthorizedError
  | NotOnboardedError
  | ApplicationError
  | EmailNotVerifiedError
  | NotAuthenticatedError;

export type RequestContextResult = Result<
  DFRequestContext,
  RequestContextError
>;

type RoleWithWorkspace = WorkspaceMemberRole & { workspace: Workspace };

type MemberWithRoles = WorkspaceMember & {
  WorkspaceMemberRole: RoleWithWorkspace[];
};

interface RolesWithWorkspace {
  workspace: WorkspaceResource | null;
  memberRoles: WorkspaceMemberRoleResource[];
}

async function findAndCreateRoles(
  member: MemberWithRoles,
): Promise<RolesWithWorkspace> {
  const domain = member.email?.split("@")[1];
  const or: Prisma.WorkspaceWhereInput[] = [
    {
      WorkspaceMemberRole: {
        some: {
          workspaceMemberId: member.id,
        },
      },
    },
  ];
  if (domain) {
    or.push({ domain });
  }

  const workspaces = await prisma().workspace.findMany({
    where: {
      OR: or,
    },
    include: {
      WorkspaceMemberRole: {
        where: {
          workspaceMemberId: member.id,
        },
      },
    },
  });

  const domainWorkspacesWithoutRole = workspaces.filter(
    (w) => w.WorkspaceMemberRole.length === 0,
  );
  let roles = workspaces.flatMap((w) => w.WorkspaceMemberRole);
  if (domainWorkspacesWithoutRole.length !== 0) {
    const newRoles = await Promise.all(
      domainWorkspacesWithoutRole.map((w) =>
        prisma().workspaceMemberRole.upsert({
          where: {
            workspaceId_workspaceMemberId: {
              workspaceId: w.id,
              workspaceMemberId: member.id,
            },
          },
          update: {},
          create: {
            workspaceId: w.id,
            workspaceMemberId: member.id,
            role: "Admin",
          },
        }),
      ),
    );
    for (const role of newRoles) {
      roles.push(role);
    }
  }
  const workspaceById = workspaces.reduce((acc, w) => {
    acc.set(w.id, w);
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
    const workspace = workspaces.find((w) => w.id === member.lastWorkspaceId);
    if (lastWorkspaceRole && workspace) {
      return { memberRoles, workspace };
    }
  }

  roles = sortBy(roles, (r) => r.createdAt.getTime());
  const role = roles[0];
  if (!role) {
    return {
      memberRoles,
      workspace: null,
    };
  }
  const workspace = workspaces.find((w) => w.id === role.workspaceId);
  if (!workspace) {
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
  let [member, account] = await Promise.all([
    prisma().workspaceMember.findUnique({
      where: { email },
      include: {
        WorkspaceMemberRole: {
          take: 1,
          include: {
            workspace: true,
          },
        },
      },
    }),
    prisma().workspaceMembeAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: authProvider,
          providerAccountId: sub,
        },
      },
    }),
  ]);

  let memberWithRole: MemberWithRoles;
  if (
    !member ||
    member.emailVerified !== email_verified ||
    member.image !== picture
  ) {
    memberWithRole = await prisma().workspaceMember.upsert({
      where: { email },
      create: {
        email,
        emailVerified: email_verified,
        image: picture,
        name,
        nickname,
      },
      include: {
        WorkspaceMemberRole: {
          take: 1,
          include: {
            workspace: true,
          },
        },
      },
      update: {
        emailVerified: email_verified,
        image: picture,
        name,
        nickname,
      },
    });
  } else {
    memberWithRole = member;
  }

  if (!account) {
    await prisma().workspaceMembeAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: authProvider,
          providerAccountId: sub,
        },
      },
      create: {
        provider: authProvider,
        providerAccountId: sub,
        workspaceMemberId: memberWithRole.id,
      },
      update: {},
    });
  }
  if (!memberWithRole.email) {
    return err({
      type: RequestContextErrorType.ApplicationError,
      message: "User missing email",
    });
  }

  const { workspace, memberRoles } = await findAndCreateRoles(memberWithRole);
  const memberResouce: WorkspaceMemberResource = {
    id: memberWithRole.id,
    email: memberWithRole.email,
    emailVerified: memberWithRole.emailVerified,
    name: memberWithRole.name ?? undefined,
    nickname: memberWithRole.nickname ?? undefined,
    picture: memberWithRole.image ?? undefined,
    createdAt: memberWithRole.createdAt.toISOString(),
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
  const workspace = await prisma().workspace.findFirst();
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
        result = await getMultiTenantRequestContext({
          authorizationToken,
          authProvider: config().authProvider,
          profile,
        });
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
        throw new Error("unhandled unauthorized error");
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
      default:
        assertUnreachable(result.error);
    }
    return result;
  });
}
