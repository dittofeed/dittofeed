import { findMessageTemplate } from "backend-lib/src/messageTemplates";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ChannelType, CompletionStatus } from "isomorphic-lib/src/types";
import { LoremIpsum } from "lorem-ipsum";
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
import prisma from "../../../lib/prisma";
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

    const [smsMessage, userProperties] = await Promise.all([
      findMessageTemplate({
        id,
        channel: ChannelType.Sms,
      }).then(unwrap),
      prisma().userProperty.findMany({
        where: {
          workspaceId: dfContext.workspace.id,
        },
      }),
    ]);

    const lorem = new LoremIpsum({
      sentencesPerParagraph: {
        max: 8,
        min: 4,
      },
      wordsPerSentence: {
        max: 16,
        min: 4,
      },
    });

    const smsMessageUserProperties = {
      ...userProperties.reduce<Record<string, string>>((memo, up) => {
        memo[up.name] = lorem.generateWords(1);
        return memo;
      }, {}),
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

    serverInitialState.userProperties = {
      type: CompletionStatus.Successful,
      value: userProperties.flatMap((up) =>
        toUserPropertyResource(up).unwrapOr([])
      ),
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
