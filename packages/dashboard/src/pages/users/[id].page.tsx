import { json as codeMirrorJson } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import {
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  useTheme,
} from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import { findMessageTemplates } from "backend-lib/src/messageTemplates";
import prisma from "backend-lib/src/prisma";
import { getUsers } from "backend-lib/src/users";
import { CompletionStatus, GetUsersResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import { DeliveriesTable } from "../../components/deliveriesTable";
import { EventsTable } from "../../components/eventsTable";
import { SubtleHeader } from "../../components/headers";
import MainLayout from "../../components/mainLayout";
import { ResourceListItemButton } from "../../components/resourceList";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import { requestContext } from "../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../lib/types";

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
  const [usersResult, messageTemplates, broadcasts, journeys] =
    await Promise.all([
      getUsers({
        workspaceId: dfContext.workspace.id,
        userIds: [userId],
      }),
      findMessageTemplates({
        workspaceId: dfContext.workspace.id,
      }),
      prisma().broadcast.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),

      prisma().journey.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);

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

  const serverInitialState: PreloadedState = {
    messages: {
      type: CompletionStatus.Successful,
      value: messageTemplates,
    },
    broadcasts: broadcasts.map(toBroadcastResource),
    journeys: {
      type: CompletionStatus.Successful,
      value: journeys.flatMap((j) => toJourneyResource(j).unwrapOr([])),
    },
  };

  return {
    props: addInitialStateToProps({
      serverInitialState,
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
                  <ResourceListItemButton
                    href={`/dashboard/segments/${segment.id}`}
                  >
                    <ListItemText>{segment.name}</ListItemText>
                  </ResourceListItemButton>
                </ListItem>
              ))}
            </List>
            <Stack spacing={1}>
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
          </Stack>
        </Stack>
        <Stack sx={{ flex: 1 }} spacing={2}>
          <Stack spacing={1} sx={{ flex: 1 }}>
            <SubtleHeader>Events</SubtleHeader>
            <EventsTable userId={user.id} />
          </Stack>
          <Stack spacing={1} sx={{ flex: 1 }}>
            <SubtleHeader>Deliveries</SubtleHeader>
            <DeliveriesTable userId={user.id} />
          </Stack>
        </Stack>
      </Stack>
    </MainLayout>
  );
};

export default User;
