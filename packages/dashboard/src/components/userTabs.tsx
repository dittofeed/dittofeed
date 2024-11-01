import { Box, Stack, Tab, Tabs } from "@mui/material";
import {
  CompletionStatus,
  DeleteUsersRequest,
  EmptyResponse,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import apiRequestHandlerFactory from "../lib/apiRequestHandlerFactory";
import { useAppStorePick } from "../lib/appStore";
import DeleteDialog from "./confirmDeleteDialog";

interface UserTabsProps {
  userId: string;
}

export function UserTabs({ userId }: UserTabsProps) {
  const router = useRouter();
  const pathSegments = router.pathname.split("/");
  const currentTab = pathSegments[pathSegments.length - 2];

  const { userDeleteRequest, setUserDeleteRequest, workspace, apiBase } =
    useAppStorePick([
      "userDeleteRequest",
      "setUserDeleteRequest",
      "workspace",
      "apiBase",
    ]);

  const handleDelete = () => {
    const workspaceId =
      workspace.type === CompletionStatus.Successful
        ? workspace.value.id
        : null;

    if (!workspaceId) {
      return;
    }

    apiRequestHandlerFactory({
      request: userDeleteRequest,
      setRequest: setUserDeleteRequest,
      responseSchema: EmptyResponse,
      onSuccessNotice: `Deleted User`,
      onFailureNoticeHandler: () => `API Error: Failed to delete User`,
      setResponse: () => {
        router.push({
          pathname: `/users`,
        });
      },
      requestConfig: {
        method: "DELETE",
        url: `${apiBase}/api/users`,
        data: {
          workspaceId,
          userIds: [userId],
        } satisfies DeleteUsersRequest,
        headers: {
          "Content-Type": "application/json",
        },
      },
    })();
  };

  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Tabs value={currentTab}>
        <Tab
          label="Properties"
          value="users"
          component={Link}
          href={`/users/${userId}`}
        />
        <Tab
          label="Segments"
          value="segments"
          component={Link}
          href={`/users/segments/${userId}`}
        />
        <Tab
          label="Events"
          value="events"
          component={Link}
          href={`/users/events/${userId}`}
        />
        <Tab
          label="Deliveries"
          value="deliveries"
          component={Link}
          href={`/users/deliveries/${userId}`}
        />
      </Tabs>
      <Box sx={{ p: 2 }}>
        <DeleteDialog
          color="error"
          onConfirm={handleDelete}
          title="Confirm Deletion"
          message="Are you sure you want to delete this User?"
        />
      </Box>
    </Stack>
  );
}
