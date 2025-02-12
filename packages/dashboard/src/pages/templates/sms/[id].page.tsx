import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import SmsEditor from "../../../components/messages/smsEditor";
import TemplatePageContent from "../../../components/messages/templatePageContent";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
import { serveSmsTemplate } from "../../../lib/messaging";
import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const id = ctx.params?.id;
    let name: string | undefined;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    if (typeof ctx.query.name === "string") {
      name = ctx.query.name;
    }

    const smsTemplateState = await serveSmsTemplate({
      workspaceId: dfContext.workspace.id,
      messageTemplateId: id,
      defaultName: name,
    });

    return {
      props: addInitialStateToProps({
        dfContext,
        serverInitialState: smsTemplateState,
        props: {},
      }),
    };
  });

export default function MessageEditor() {
  const router = useRouter();
  const messageId =
    typeof router.query.id === "string" ? router.query.id : null;
  const { member } = useAppStorePick(["member"]);
  if (!messageId) {
    return null;
  }
  return (
    <TemplatePageContent>
      <SmsEditor
        key={messageId}
        templateId={messageId}
        member={member ?? undefined}
      />
    </TemplatePageContent>
  );
}
