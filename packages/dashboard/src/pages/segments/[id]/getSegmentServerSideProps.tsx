import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { and, eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";

const getSegmentServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const [segment] = await Promise.all([
      db().query.segment.findFirst({
        where: and(
          eq(schema.segment.id, id),
          eq(schema.segment.workspaceId, dfContext.workspace.id),
        ),
      }),
    ]);
    if (!segment) {
      return {
        notFound: true,
      };
    }

    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
      }),
    };
  });

export default getSegmentServerSideProps;
