import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  EmailContentsType,
  EmailContentsTypeEnum,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React from "react";
import { validate } from "uuid";

import EmailEditor from "../../../components/messages/emailEditor";
import TemplatePageContent from "../../../components/messages/templatePageContent";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { useAppStorePick } from "../../../lib/appStore";
import { serveEmailTemplate } from "../../../lib/messaging";
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
    let defaultName: string | undefined;
    if (typeof ctx.query.name === "string") {
      defaultName = ctx.query.name;
    }
    const emailContentsType = schemaValidateWithErr(
      ctx.query.emailContentType,
      EmailContentsTypeEnum,
    ).unwrapOr(EmailContentsType.Code);

    const serverInitialState = await serveEmailTemplate({
      workspaceId: dfContext.workspace.id,
      messageTemplateId: templateId,
      emailContentsType,
      defaultName,
    });

    // for some reason, new messages are not being merged into existing
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
  const { member } = useAppStorePick(["member"]);

  const messageId =
    typeof router.query.id === "string" ? router.query.id : null;

  if (!messageId) {
    return null;
  }
  return (
    <TemplatePageContent>
      <EmailEditor templateId={messageId} member={member ?? undefined} />
    </TemplatePageContent>
  );
}
