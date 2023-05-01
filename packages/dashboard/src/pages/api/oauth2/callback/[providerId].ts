import { decodeJwtHeader } from "backend-lib/src/auth";
import type { NextApiRequest, NextApiResponse } from "next";

import prisma from "../../../../lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { providerId } = req.query;
  const providerIdStr = Array.isArray(req.query.providerId)
    ? req.query.providerId[0]
    : req.query.providerId;

  // FIXME redirect to waiting room
  if (typeof providerIdStr !== "string") {
    return res.redirect("/404");
  }

  const decodedJwt = decodeJwtHeader(req.headers.authorization);

  if (!decodedJwt) {
    return res.redirect("/404");
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { sub, email, picture, email_verified } = decodedJwt;

  const member = await prisma().workspaceMember.upsert({
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

  await prisma().workspaceMembeAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: providerIdStr,
        providerAccountId: sub,
      },
    },
    create: {
      provider: providerIdStr,
      providerAccountId: sub,
      workspaceMemberId: member.id,
    },
    update: {},
  });

  res.redirect("/journeys");
}
