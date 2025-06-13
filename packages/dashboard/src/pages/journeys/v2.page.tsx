import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { and, eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { validate } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import JourneyV2 from "../../components/journeys/v2";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const { id } = ctx.query;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const journey = await db().query.journey.findFirst({
      columns: {
        id: true,
      },
      where: and(
        eq(schema.journey.id, id),
        eq(schema.journey.workspaceId, dfContext.workspace.id),
      ),
    });

    if (!journey) {
      return {
        notFound: true,
      };
    }

    const props = addInitialStateToProps({
      props: {},
      dfContext,
    });

    return {
      props,
    };
  });

export default function JourneyPageV2() {
  const path = useRouter();
  const id = typeof path.query.id === "string" ? path.query.id : undefined;
  if (!id) {
    return null;
  }

  return (
    <DashboardContent>
      <JourneyV2 id={id} />
    </DashboardContent>
  );
}
