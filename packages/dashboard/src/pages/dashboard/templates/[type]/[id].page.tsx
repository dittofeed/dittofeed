import backendConfig from "backend-lib/src/config";
import { findAllUserTraits } from "backend-lib/src/userEvents";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import {
  CompletionStatus,
  TemplateResourceType,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React from "react";
import { validate } from "uuid";

import MainLayout from "../../../../components/mainLayout";
import EmailEditor, {
  defaultEmailMessageState,
} from "../../../../components/messages/emailEditor";
import {
  addInitialStateToProps,
  PreloadedState,
  PropsWithInitialState,
} from "../../../../lib/appStore";
import prisma from "../../../../lib/prisma";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState<{ messageResourceType: TemplateResourceType }>
> = async (ctx) => {
  const workspaceId = backendConfig().defaultWorkspaceId;
  let serverInitialState: PreloadedState;
  let messageResourceType: TemplateResourceType;
  switch (ctx.params?.type) {
    case "emails": {
      messageResourceType = TemplateResourceType.Email;
      const { id } = ctx.params;

      if (typeof id !== "string" || !validate(id)) {
        serverInitialState = defaultEmailMessageState;
        break;
      }
      const [emailMessage, workspace, userProperties] = await Promise.all([
        prisma().emailTemplate.findUnique({
          where: {
            id,
          },
        }),
        prisma().workspace.findUnique({
          where: {
            id: workspaceId,
          },
        }),
        prisma().userProperty.findMany({
          where: {
            workspaceId,
          },
        }),
      ]);

      serverInitialState = defaultEmailMessageState;

      serverInitialState.userProperties = {
        type: CompletionStatus.Successful,
        value: userProperties.flatMap((up) =>
          toUserPropertyResource(up).unwrapOr([])
        ),
      };

      if (emailMessage) {
        const { from, subject, body, name } = emailMessage;
        Object.assign(serverInitialState, {
          emailMessageTitle: name,
          emailMessageFrom: from,
          emailMessageSubject: subject,
          emailMessageBody: body,
        });
      }

      if (workspace) {
        // TODO PLI-212
        serverInitialState.workspace = {
          type: CompletionStatus.Successful,
          value: {
            id: workspaceId,
            name: workspace.name,
          },
        };
      }
      break;
    }
    default:
      return { notFound: true };
  }

  return {
    props: addInitialStateToProps(
      {
        messageResourceType,
      },
      serverInitialState
    ),
  };
};

export default function MessageEditor() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <EmailEditor />
        </MainLayout>
      </main>
    </>
  );
}
