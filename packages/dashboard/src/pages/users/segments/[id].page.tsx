import { List, ListItem, ListItemText, Stack } from "@mui/material";
import logger from "backend-lib/src/logger";
import { getUsers } from "backend-lib/src/users";
import { CompletionStatus, GetUsersResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import DashboardContent from "../../../components/dashboardContent";
import { SubtleHeader } from "../../../components/headers";
import { ResourceListItemButton } from "../../../components/resourceList";
import { UserTabs } from "../../../components/UserTabs";
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

  const usersResult = await getUsers({
    workspaceId: dfContext.workspace.id,
    userIds: [userId],
  });

  if (usersResult.isErr()) {
    logger().error({ err: usersResult.error }, "Unable to retrieve user");
    throw new Error("Unable to retrieve user");
  }

  const [user] = usersResult.value.users;

  if (!user) {
    return { notFound: true };
  }

  const serverInitialState: PreloadedState = {
    // Add any necessary initial state here
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
    <DashboardContent>
      <UserTabs userId={user.id} />
      <Stack spacing={2} sx={{ padding: 2, width: "100%" }}>
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
    </DashboardContent>
  );
};

export default UserSegments;
