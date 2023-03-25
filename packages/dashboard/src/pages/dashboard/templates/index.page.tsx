import { AddCircleOutline, Delete } from "@mui/icons-material";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import backendConfig from "backend-lib/src/config";
import {
  CompletionStatus,
  DeleteMessageTemplateRequest,
  DeleteMessageTemplateResponse,
  EmailTemplateResource,
  MessageTemplateResource,
  TemplateResourceType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

import MainLayout from "../../../components/mainLayout";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import {
  addInitialStateToProps,
  PropsWithInitialState,
  useAppStore,
} from "../../../lib/appStore";
import prisma from "../../../lib/prisma";
import { AppState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  const workspaceId = backendConfig().defaultWorkspaceId;

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
    props: addInitialStateToProps(
      {},
      {
        messages,
      }
    ),
  };
};

function TemplateListItem({ template }: { template: MessageTemplateResource }) {
  const path = useRouter();

  const setMessageTemplateDeleteRequest = useAppStore(
    (store) => store.setMessageTemplateDeleteRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const journeyDeleteRequest = useAppStore(
    (store) => store.journeyDeleteRequest
  );
  const deleteMessageTemplate = useAppStore((store) => store.deleteMessage);

  const setDeleteResponse = (
    _response: DeleteMessageTemplateResponse,
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
    request: journeyDeleteRequest,
    setRequest: setMessageTemplateDeleteRequest,
    responseSchema: DeleteMessageTemplateResponse,
    setResponse: setDeleteResponse,
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
          path.push(`/dashboard/templates/${messageType}/${template.id}`);
        }}
      >
        <ListItemText primary={template.name} />
      </ListItemButton>
    </ListItem>
  );
}

function TemplateListContents() {
  const path = useRouter();
  const messagesResult = useAppStore((store) => store.messages);
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
          onClick={() => {
            path.push(`/dashboard/templates/emails/${uuid()}`);
          }}
        >
          <AddCircleOutline />
        </IconButton>
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
