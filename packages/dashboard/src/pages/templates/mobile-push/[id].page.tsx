import { findMessageTemplate } from "backend-lib/src/messageTemplates";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ChannelType } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { v4 as uuid, validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import MobilePushEditor, {
  defaultInitialUserProperties,
  defaultMobilePushMessageState,
} from "../../../components/messages/mobilePushEditor";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    let serverInitialState: PreloadedState;
    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      serverInitialState = defaultMobilePushMessageState(uuid());

      return {
        notFound: true,
      };
    }

    const mobilePushMessage = unwrap(
      await findMessageTemplate({
        id,
        channel: ChannelType.MobilePush,
      })
    );

    const mobilePushMessageUserProperties = {
      ...defaultInitialUserProperties,
    };
    const mobilePushMessageUserPropertiesJSON = JSON.stringify(
      mobilePushMessageUserProperties,
      null,
      2
    );

    serverInitialState = {
      ...defaultMobilePushMessageState(id),
      mobilePushMessageUserProperties,
      mobilePushMessageUserPropertiesJSON,
    };

    if (
      mobilePushMessage &&
      mobilePushMessage.definition.type === ChannelType.MobilePush &&
      mobilePushMessage.workspaceId === dfContext.workspace.id
    ) {
      const { title, body, imageUrl } = mobilePushMessage.definition;
      Object.assign(serverInitialState, {
        mobilePushMessageTitle: title,
        mobilePushMessageBody: body,
        mobilePushMesssageImageUrl: imageUrl,
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
          <MobilePushEditor key={messageId} />
        </MainLayout>
      </main>
    </>
  );
}
