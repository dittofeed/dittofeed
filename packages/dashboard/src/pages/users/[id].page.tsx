import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
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
import { ResourceListItemButton } from "../../components/resourceList";
import { EventsTable } from "../../components/eventsTable";

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
  const properties = JSON.stringify(
    Object.values(user.properties).reduce<Record<string, string>>(
      (acc, property) => {
        acc[property.name] = property.value;
        return acc;
      },
      {}
    ),
    null,
    2
  );

  return (
    <MainLayout>
      <Stack
        direction="row"
        sx={{ padding: 2, width: "100%" }}
        spacing={2}
        divider={<Divider orientation="vertical" />}
      >
        <Stack sx={{ flex: 1, height: "100%" }} spacing={2}>
          <Stack spacing={1}>
            <Typography
              variant="h2"
              fontWeight={300}
              sx={{ fontSize: 20, marginBottom: 0.5 }}
            >
              Segments
            </Typography>
            <List
              sx={{
                width: "100%",
                bgcolor: "background.paper",
                minHeight: "5rem",
                borderRadius: 1,
              }}
            >
              {user.segments.map((segment) => (
                <ListItem>
                  <ResourceListItemButton
                    href={`/dashboard/segments/${segment.id}`}
                  >
                    <ListItemText>{segment.name}</ListItemText>
                  </ResourceListItemButton>
                </ListItem>
              ))}
            </List>
            <Stack spacing={1}>
              <Typography
                variant="h2"
                fontWeight={300}
                sx={{ fontSize: 20, marginBottom: 0.5 }}
              >
                User Properties
              </Typography>
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
          </Stack>
        </Stack>
        <Box sx={{ flex: 1 }}>
          <EventsTable />
        </Box>
      </Stack>
    </MainLayout>
  );
};

export default User;
