import { List, ListItem, ListItemText, Stack } from "@mui/material";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
// Import or define the toSegmentResource function
import { toSegmentResource } from "backend-lib/src/segments";
import { getUsers } from "backend-lib/src/users";
import {
  CompletionStatus,
  GetUsersResponse,
  SavedSegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import { SubtleHeader } from "../../../components/headers";
import { ResourceListItemButton } from "../../../components/resourceList";
import { UserLayout } from "../../../components/userLayout";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

interface UserSegmentsPageProps {
  user: GetUsersResponse["users"][0];
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<UserSegmentsPageProps>
> = requestContext(async (ctx, dfContext) => {
  const userId = ctx.query.id;
  if (typeof userId !== "string") {
    return { notFound: true };
  }

  const [usersResult, segments] = await Promise.all([
    getUsers({
      workspaceId: dfContext.workspace.id,
      userIds: [userId],
    }),
    prisma().segment.findMany({
      where: {
        workspaceId: dfContext.workspace.id,
      },
    }),
  ]);

  if (usersResult.isErr()) {
    logger().error({ err: usersResult.error }, "Unable to retrieve user");
    throw new Error("Unable to retrieve user");
  }

  const [user] = usersResult.value.users;

  if (!user) {
    return { notFound: true };
  }

  const segmentResources: SavedSegmentResource[] = segments.flatMap((segment) =>
    toSegmentResource(segment).unwrapOr([]),
  );

  const serverInitialState: PreloadedState = {
    segments: {
      type: CompletionStatus.Successful,
      value: segmentResources,
    },
  };

  return {
    props: addInitialStateToProps({
      serverInitialState,
      dfContext,
      props: { user },
    }),
  };
});

const UserSegments: NextPage<UserSegmentsPageProps> = function UserSegments(
  props,
) {
  const { user } = props;

  return (
    <UserLayout userId={user.id}>
      <Stack spacing={2} sx={{ padding: 2, width: "100%", height: "100%" }}>
        <SubtleHeader>Segments</SubtleHeader>
        <List
          sx={{
            width: "100%",
            bgcolor: "background.paper",
            minHeight: "5rem",
            borderRadius: 1,
          }}
        >
          {user.segments.map((segment) => (
            <ListItem key={segment.id}>
              <ResourceListItemButton href={`/segments/${segment.id}`}>
                <ListItemText>{segment.name}</ListItemText>
              </ResourceListItemButton>
            </ListItem>
          ))}
        </List>
      </Stack>
    </UserLayout>
  );
};

export default UserSegments;
