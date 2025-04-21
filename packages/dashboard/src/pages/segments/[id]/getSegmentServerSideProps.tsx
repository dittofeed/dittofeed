import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { findMessageTemplates } from "backend-lib/src/messaging";
import { subscriptionGroupToResource } from "backend-lib/src/subscriptionGroups";
import { eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { getSegmentConfigState } from "../../../lib/segments";
import { PropsWithInitialState } from "../../../lib/types";

// FIXME remove segment lookup
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
    const [subscriptionGroups, messageTemplates] = await Promise.all([
      db().query.subscriptionGroup.findMany({
        where: eq(schema.subscriptionGroup.workspaceId, workspaceId),
      }),
      findMessageTemplates({
        workspaceId,
      }),
    ]);
    const serverInitialState = getSegmentConfigState({
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
