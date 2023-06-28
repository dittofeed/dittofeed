import { Stack } from "@mui/material";
import { getMobilePushTemplates } from "backend-lib/src/mobilePushTemplates";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React from "react";
import { validate } from "uuid";

import MainLayout from "../../../components/mainLayout";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";
import MobilePushEditor, { defaultInitialUserProperties } from "../../../components/messages/mobilePushEditor";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }
    const workspaceId = dfContext.workspace.id;
    let serverInitialState: PreloadedState = {};
    const mobilePushTemplates = await getMobilePushTemplates({
      workspaceId,
    });

    const mobilePushMessageUserProperties = {
      ...defaultInitialUserProperties,
    };
    const mobilePushMessageUserPropertiesJSON = JSON.stringify(
      mobilePushMessageUserProperties,
      null,
      2
    );

    serverInitialState = {
      mobilePushMessageUserProperties,
      mobilePushMessageUserPropertiesJSON,
    };    

    serverInitialState.messages = {
      type: CompletionStatus.Successful,
      value: mobilePushTemplates,
    };

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState,
        props: {},
      }),
    };
  });

export default function MessageEditor() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <MobilePushEditor />
        </MainLayout>
      </main>
    </>
  );
}
