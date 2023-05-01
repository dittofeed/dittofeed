import { decodeJwtHeader } from "backend-lib/src/auth";
import backendConfig from "backend-lib/src/config";
import {
  EMAIL_NOT_VERIFIED_PAGE,
  UNAUTHORIZED_PAGE,
} from "isomorphic-lib/src/constants";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "./lib/prisma";

export async function middleware(req: NextRequest) {
  if (backendConfig().authMode !== "anonymous") {
    const { authProvider } = backendConfig();

    if (!authProvider) {
      throw new Error("Misconfigured auth provider, missing.");
    }

    const authorization = req.headers.get("authorization");
    const decodedJwt = authorization ? decodeJwtHeader(authorization) : null;

    if (!decodedJwt) {
      return NextResponse.redirect(new URL(UNAUTHORIZED_PAGE, req.url));
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { sub, email, picture, email_verified } = decodedJwt;

    if (!email_verified) {
      return NextResponse.redirect(new URL(EMAIL_NOT_VERIFIED_PAGE, req.url));
    }

    // eslint-disable-next-line prefer-const
    let [member, account] = await Promise.all([
      prisma().workspaceMember.findUnique({
        where: { email },
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
  }
  return undefined;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
