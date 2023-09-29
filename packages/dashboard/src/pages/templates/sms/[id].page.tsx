import { findMessageTemplate } from "backend-lib/src/messageTemplates";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ChannelType } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { v4 as uuid, validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import SmsEditor, {
  defaultInitialUserProperties,
  defaultSmsMessageState,
} from "../../../components/messages/smsEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    let serverInitialState: PreloadedState;
    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      serverInitialState = defaultSmsMessageState(uuid());

      return {
        notFound: true,
      };
    }

    const smsMessage = unwrap(
      await findMessageTemplate({
        id,
        channel: ChannelType.Sms,
      })
    );

    const smsMessageUserProperties = {
      ...defaultInitialUserProperties,
    };
    const smsMessageUserPropertiesJSON = JSON.stringify(
      smsMessageUserProperties,
      null,
      2
    );

    serverInitialState = {
      ...defaultSmsMessageState(id),
      smsMessageUserProperties,
      smsMessageUserPropertiesJSON,
    };

    if (
      smsMessage &&
      smsMessage.definition.type === ChannelType.Sms &&
      smsMessage.workspaceId === dfContext.workspace.id
    ) {
      const { body } = smsMessage.definition;
      Object.assign(serverInitialState, {
        smsMessageBody: body,
      });
    }

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
          <SmsEditor key={messageId} />
        </MainLayout>
      </main>
    </>
  );
}
