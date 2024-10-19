import { findMessageTemplates } from "backend-lib/src/messaging";
import { toSegmentResource } from "backend-lib/src/segments";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import prisma from "../../../lib/prisma";
import { requestContext } from "../../../lib/requestContext";
import { getSegmentConfigState } from "../../../lib/segments";
import { PropsWithInitialState } from "../../../lib/types";

const getSegmentServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }
    let name: string | undefined;
    if (typeof ctx.query.name === "string") {
      name = ctx.query.name;
    }

    const workspaceId = dfContext.workspace.id;
    const [segment, subscriptionGroups, messageTemplates] = await Promise.all([
      prisma().segment.findUnique({
        where: {
          id,
        },
      }),
      prisma().subscriptionGroup.findMany({
        where: {
          workspaceId,
        },
      }),
      findMessageTemplates({
        workspaceId,
      }),
    ]);
    const serverInitialState = getSegmentConfigState({
      segment: segment ? unwrap(toSegmentResource(segment)) : null,
      name,
      segmentId: id,
      workspaceId,
      subscriptionGroups: subscriptionGroups.map((sg) =>
        subscriptionGroupToResource(sg),
      ),
      messageTemplates,
    });

    return {
      props: addInitialStateToProps({
        serverInitialState,
        props: {},
        dfContext,
      }),
    };
  });

export default getSegmentServerSideProps;
