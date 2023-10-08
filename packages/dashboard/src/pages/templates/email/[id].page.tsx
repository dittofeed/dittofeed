import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import EmailEditor from "../../../components/messages/emailEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { getEmailEditorState } from "../../../lib/email";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const templateId = ctx.params?.id;

    if (typeof templateId !== "string" || !validate(templateId)) {
      return {
        notFound: true,
      };
    }
    const workspaceId = dfContext.workspace.id;

    const serverInitialState = await getEmailEditorState({
      templateId,
      workspaceId,
    });
    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState,
        props: {},
      }),
    };
  });

export default function MessageEditor() {
  const router = useRouter();

  const messageId =
    typeof router.query.id === "string" ? router.query.id : null;

  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <EmailEditor key={messageId} />
        </MainLayout>
      </main>
    </>
  );
}
