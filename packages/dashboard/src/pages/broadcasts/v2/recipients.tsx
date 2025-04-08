import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { and, eq } from "drizzle-orm";
import { GetServerSideProps } from "next";
import Link from "next/link";
import React from "react";
import { validate as validateUuid } from "uuid";

import DashboardContent from "../../../components/dashboardContent";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";
import BroadcastLayout from "./broadcastLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const broadcastId = ctx.params?.broadcastId;
    if (typeof broadcastId !== "string") {
      return {
        notFound: true,
      };
    }
    if (!validateUuid(broadcastId)) {
      return {
        notFound: true,
      };
    }
    const broadcast = await db().query.broadcast.findFirst({
      where: and(
        eq(schema.broadcast.id, broadcastId),
        eq(schema.workspace.id, dfContext.workspace.id),
      ),
    });
    if (!broadcast) {
      return {
        notFound: true,
      };
    }
    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
      }),
    };
  });

export default function BroadcastRecipientsPage() {
  return (
    <DashboardContent>
      <BroadcastLayout activeStepKey="recipients">
        <Typography>Recipients Page</Typography>
        {/* TODO: Implement segment selection component */}
        <Box sx={{ mt: 2 }}>
          <Link href="/segments/create" passHref legacyBehavior>
            <Button variant="contained" component="a">
              Create New Segment
            </Button>
          </Link>
        </Box>
      </BroadcastLayout>
    </DashboardContent>
  );
}
