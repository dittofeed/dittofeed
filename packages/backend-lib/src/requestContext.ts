import { Prisma } from "@prisma/client";
import { IncomingHttpHeaders } from "http";
import { err, ok, Result } from "neverthrow";
import { sortBy } from "remeda";

import { decodeJwtHeader } from "./auth";
import config from "./config";
import prisma from "./prisma";
import {
  DFRequestContext,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberRole,
  WorkspaceMemberRoleResource,
  WorkspaceResource,
} from "./types";

export const SESSION_KEY = "df-session-key" as const;

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
}

export interface NotOnboardedError {
  type: RequestContextErrorType.NotOnboarded;
  message: string;
}

export interface ApplicationError {
  type: RequestContextErrorType.ApplicationError;
  message: string;
}

export interface EmailNotVerifiedError {
  type: RequestContextErrorType.EmailNotVerified;
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
  member: MemberWithRoles
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
    (w) => w.WorkspaceMemberRole.length === 0
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
        })
      )
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
      (r) => r.workspaceId === member.lastWorkspaceId
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
}: {
  authorizationToken: string | null;
  authProvider?: string;
}): Promise<RequestContextResult> {
  if (!authProvider) {
    return err({
      type: RequestContextErrorType.ApplicationError,
      message: "Misconfigured auth provider, missing.",
    });
  }

  if (!authorizationToken) {
    return err({
      type: RequestContextErrorType.ApplicationError,
      message: "authorizationToken is missing",
    });
  }

  const decodedJwt = decodeJwtHeader(authorizationToken);

  if (!decodedJwt) {
    return err({
      type: RequestContextErrorType.Unauthorized,
      message: "Unable to decode jwt",
    });
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { sub, email, picture, email_verified, name, nickname } = decodedJwt;

  if (!email_verified) {
    return err({
      type: RequestContextErrorType.EmailNotVerified,
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

  if (!workspace) {
    return err({
      type: RequestContextErrorType.NotOnboarded,
      message: "User missing role",
    });
  }

  return ok({
    member: {
      id: memberWithRole.id,
      email: memberWithRole.email,
      emailVerified: memberWithRole.emailVerified,
      name: memberWithRole.name ?? undefined,
      nickname: memberWithRole.nickname ?? undefined,
      picture: memberWithRole.image ?? undefined,
      createdAt: memberWithRole.createdAt.toISOString(),
    },
    workspace,
    memberRoles,
  });
}

async function getAnonymousRequestContext(): Promise<RequestContextResult> {
  const workspace = await prisma().workspace.findFirst();
  if (!workspace) {
    return err({
      type: RequestContextErrorType.NotOnboarded,
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
  headers: IncomingHttpHeaders
): Promise<RequestContextResult> {
  const { authMode } = config();
  switch (authMode) {
    case "anonymous": {
      return getAnonymousRequestContext();
    }
    case "single-tenant": {
      if (headers[SESSION_KEY] !== "true") {
        return err({
          type: RequestContextErrorType.NotAuthenticated,
        });
      }
      return getAnonymousRequestContext();
    }
    case "multi-tenant": {
      const authorizationToken =
        headers.authorization && typeof headers.authorization === "string"
          ? headers.authorization
          : null;
      return getMultiTenantRequestContext({
        authorizationToken,
        authProvider: config().authProvider,
      });
    }
  }
}
