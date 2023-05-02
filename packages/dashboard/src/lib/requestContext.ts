import { decodeJwtHeader } from "backend-lib/src/auth";
import backendConfig from "backend-lib/src/config";
import {
  EMAIL_NOT_VERIFIED_PAGE,
  UNAUTHORIZED_PAGE,
  WAITING_ROOM_PAGE,
} from "isomorphic-lib/src/constants";
import { GetServerSideProps } from "next";

import prisma from "./prisma";
import { GetDFServerSideProps, PropsWithInitialState } from "./types";

export const requestContext: <T>(
  gssp: GetDFServerSideProps<PropsWithInitialState<T>>
) => GetServerSideProps<PropsWithInitialState<T>> =
  (gssp) => async (context) => {
    if (backendConfig().authMode === "anonymous") {
      const workspaceId = backendConfig().defaultWorkspaceId;

      const workspace = await prisma().workspace.findUnique({
        where: {
          id: workspaceId,
        },
      });
      if (!workspace) {
        throw new Error("Misconfigured default workspace, missing.");
      }
      return gssp(context, {
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        member: {
          id: "anonymous",
          email: "anonymous@email.com",
          emailVerified: true,
        },
        memberRoles: [
          {
            workspaceId: workspace.id,
            workspaceMemberId: "anonymous",
            role: "Admin",
          },
        ],
      });
    }

    const { authProvider } = backendConfig();

    if (!authProvider) {
      throw new Error("Misconfigured auth provider, missing.");
    }

    const { authorization } = context.req.headers;
    const decodedJwt = authorization ? decodeJwtHeader(authorization) : null;

    if (!decodedJwt) {
      return { redirect: { destination: UNAUTHORIZED_PAGE, permanent: false } };
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { sub, email, picture, email_verified } = decodedJwt;

    if (!email_verified) {
      return {
        redirect: { destination: EMAIL_NOT_VERIFIED_PAGE, permanent: false },
      };
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

    if (
      !member ||
      member.emailVerified !== email_verified ||
      member.image !== picture
    ) {
      member = await prisma().workspaceMember.upsert({
        where: { email },
        create: {
          email,
          emailVerified: email_verified,
          image: picture,
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
        },
      });
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
          workspaceMemberId: member.id,
        },
        update: {},
      });
    }

    // TODO allow users to switch between workspaces
    const role = member.WorkspaceMemberRole[0];

    if (!role) {
      return { redirect: { destination: WAITING_ROOM_PAGE, permanent: false } };
    }

    if (!member.email) {
      throw new Error("Member email is missing.");
    }

    return gssp(context, {
      member: {
        id: member.id,
        email: member.email,
        emailVerified: member.emailVerified,
      },
      workspace: {
        id: role.workspace.id,
        name: role.workspace.name,
      },
      memberRoles: [
        {
          workspaceId: role.workspace.id,
          role: role.role,
          workspaceMemberId: member.id,
        },
      ],
    });
  };
