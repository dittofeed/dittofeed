import { GetServerSideProps } from "next";
import { validate } from "uuid";

import prisma from "../lib/prisma";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

const REDIRECT_TARGET = {
  redirect: {
    permanent: false,
    destination: "/",
  },
} as const;

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const { workspaceId } = ctx.query;

    if (typeof workspaceId !== "string" || !validate(workspaceId)) {
      return REDIRECT_TARGET;
    }
    await prisma().workspaceMember.update({
      where: {
        id: dfContext.member.id,
      },
      data: {
        lastWorkspaceId: workspaceId,
      },
    });

    return REDIRECT_TARGET;
  });

export default function Empty() {
  return null;
}
