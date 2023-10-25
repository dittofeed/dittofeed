import { Stack, useTheme } from "@mui/material";
import logger from "backend-lib/src/logger";
import { getUsers } from "backend-lib/src/users";
import { json as codeMirrorJson } from "@codemirror/lang-json";
import ReactCodeMirror from "@uiw/react-codemirror";
import { GetUsersResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";
import { EditorView } from "@codemirror/view";

import MainLayout from "../../components/mainLayout";
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
    return {
      notFound: true,
    };
  }
  const usersResult = await getUsers({
    workspaceId: dfContext.workspace.id,
    userIds: [userId],
  });

  if (usersResult.isErr()) {
    logger().error(
      {
        err: usersResult.error,
      },
      "Unable to retrieve user"
    );
    throw new Error("Unable to retrieve user");
  }

  logger().debug({ value: usersResult.value }, "usersResult");
  const [user] = usersResult.value.users;

  if (!user) {
    return {
      notFound: true,
    };
  }

  return {
    props: addInitialStateToProps({
      serverInitialState: {},
      dfContext,
      props: {
        user,
      },
    }),
  };
});

const User: NextPage<UserPageProps> = function User(props) {
  const { user } = props;
  const theme = useTheme();
  const properties = user.properties


  return (
    <MainLayout>
      <Stack>
        <ReactCodeMirror
          value={user.}
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

        {JSON.stringify(user)}
      </Stack>
    </MainLayout>
  );
};

export default User;
