import { AddCircleOutline, Delete } from "@mui/icons-material";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import {
  CompletionStatus,
  DeleteMessageTemplateRequest,
  EmailTemplateResource,
  EmptyResponse,
  MessageTemplateResource,
  TemplateResourceType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import { v4 as uuid } from "uuid";

import MainLayout from "../../components/mainLayout";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import { AppState, PropsWithInitialState } from "../../lib/types";
import Link from "next/link";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;

    const emails: EmailTemplateResource[] = (
      await prisma().emailTemplate.findMany({
        where: { workspaceId },
      })
    ).map((e) => ({
      type: TemplateResourceType.Email,
      name: e.name,
      id: e.id,
      workspaceId: e.workspaceId,
      from: e.from,
      subject: e.subject,
      body: e.body,
    }));

    const messages: AppState["messages"] = {
      type: CompletionStatus.Successful,
      value: emails,
    };

    return {
      props: addInitialStateToProps({
        dfContext,
        props: {},
        serverInitialState: {
          messages,
        },
      }),
    };
  });

function TemplateListItem({ template }: { template: MessageTemplateResource }) {
  const path = useRouter();

  const setMessageTemplateDeleteRequest = useAppStore(
    (store) => store.setMessageTemplateDeleteRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const messageTemplateDeleteRequest = useAppStore(
    (store) => store.messageTemplateDeleteRequest
  );
  const deleteMessageTemplate = useAppStore((store) => store.deleteMessage);

  const setDeleteResponse = (
    _response: EmptyResponse,
    deleteRequest?: DeleteMessageTemplateRequest
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteMessageTemplate(deleteRequest.id);
  };

  const deleteData: DeleteMessageTemplateRequest = {
    id: template.id,
    type: template.type,
  };
  const handleDelete = apiRequestHandlerFactory({
    request: messageTemplateDeleteRequest,
    setRequest: setMessageTemplateDeleteRequest,
    responseSchema: EmptyResponse,
    setResponse: setDeleteResponse,
    onSuccessNotice: `Deleted template ${template.name}.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to delete template ${template.name}.`,
    requestConfig: {
      method: "DELETE",
      url: `${apiBase}/api/content/templates`,
      data: deleteData,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });
  return (
    <ListItem
      secondaryAction={
        <IconButton edge="end" onClick={handleDelete}>
          <Delete />
        </IconButton>
      }
    >
      <ListItemButton
        sx={{
          border: 1,
          borderRadius: 1,
          borderColor: "grey.200",
        }}
        onClick={() => {
          let messageType: string;
          switch (template.type) {
            case TemplateResourceType.Email:
              messageType = "emails";
          }
          path.push(`/templates/${messageType}/${template.id}`);
        }}
      >
        <ListItemText primary={template.name} />
      </ListItemButton>
    </ListItem>
  );
}

function TemplateListContents() {
  const path = useRouter();
  const [newAnchorEl, setNewAnchorEl] = useState<null | HTMLElement>(null);
  const messagesResult = useAppStore((store) => store.messages);
  const [newOpen, setNewOpen] = useState(false);
  const [newSelectValue, setNewSelectValue] = useState("");
  // const handleNewItemClick = (value: number) => {
  //   setValue(value);
  //   handleClose();
  // };

  const messages =
    messagesResult.type === CompletionStatus.Successful
      ? messagesResult.value
      : [];

  let innerContents;
  if (messages.length) {
    innerContents = (
      <List
        sx={{
          width: "100%",
          bgcolor: "background.paper",
          borderRadius: 1,
        }}
      >
        {messages.map((template) => (
          <TemplateListItem template={template} key={template.id} />
        ))}
      </List>
    );
  } else {
    innerContents = null;
  }

  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        maxWidth: "40rem",
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          Message Library
        </Typography>
        <IconButton
          onClick={(event: React.MouseEvent<HTMLElement>) => {
            // setNewOpen(true);
            // path.push(`/templates/emails/${uuid()}`);
            setNewAnchorEl(event.currentTarget);
          }}
        >
          <AddCircleOutline />
        </IconButton>
        <Menu
          open={Boolean(newAnchorEl)}
          onClose={() => setNewAnchorEl(null)}
          anchorEl={newAnchorEl}
        >
          <MenuItem value="email" LinkComponent={Link}>
            Email
          </MenuItem>
          <MenuItem LinkComponent={Link} href="/">
            Mobile Push
          </MenuItem>
        </Menu>
      </Stack>
      {innerContents}
    </Stack>
  );
}

export default function TemplateList() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <TemplateListContents />
        </MainLayout>
      </main>
    </>
  );
}
