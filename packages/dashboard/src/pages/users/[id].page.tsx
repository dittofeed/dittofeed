import { json as codeMirrorJson } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { Stack, useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import logger from "backend-lib/src/logger";
import { getUsers } from "backend-lib/src/users";
import { CompletionStatus, GetUsersResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import DashboardContent from "../../components/dashboardContent";
import { SubtleHeader } from "../../components/headers";
import { UserTabs } from "../../components/UserTabs";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PropsWithInitialState } from "../../lib/types";

interface UserPageProps {
  user: GetUsersResponse["users"][0];
}

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<UserPageProps>
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

  return {
    props: addInitialStateToProps({
      serverInitialState: {},
      dfContext,
      props: { user },
    }),
  };
});

const User: NextPage<UserPageProps> = function User(props) {
  const { user } = props;
  const theme = useTheme();
  const properties = JSON.stringify(
    Object.values(user.properties).reduce<Record<string, string>>(
      (acc, property) => {
        acc[property.name] = property.value;
        return acc;
      },
      {},
    ),
    null,
    2,
  );

  return (
    <DashboardContent>
      <UserTabs userId={user.id} />
      <Stack spacing={2} sx={{ padding: 2, width: "100%" }}>
        <SubtleHeader>User Properties</SubtleHeader>
        <ReactCodeMirror
          value={properties}
          readOnly
          extensions={[
            codeMirrorJson(),
            EditorView.lineWrapping,
            EditorView.theme({
              "&": {
                fontFamily: theme.typography.fontFamily,
              },
            }),
          ]}
        />
      </Stack>
    </DashboardContent>
  );
};

export default User;
