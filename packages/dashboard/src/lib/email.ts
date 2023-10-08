import { toUserPropertyResource } from "backend-lib/src/userProperties";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { LoremIpsum } from "lorem-ipsum";

import {
  defaultEmailMessageState,
  defaultInitialUserProperties,
} from "../components/messages/emailEditor";
import prisma from "./prisma";
import { AppState } from "./types";

export async function getEmailEditorState({
  templateId: id,
  workspaceId,
}: {
  templateId: string;
  workspaceId: string;
}): Promise<Partial<AppState>> {
  const [emailMessage, userProperties] = await Promise.all([
    prisma().messageTemplate.findUnique({
      where: {
        id,
      },
    }),
    prisma().userProperty.findMany({
      where: {
        workspaceId,
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

  const emailMessageUserProperties = {
    ...userProperties.reduce<Record<string, string>>((memo, up) => {
      memo[up.name] = lorem.generateWords(1);
      return memo;
    }, {}),
    ...defaultInitialUserProperties,
  };
  const emailMessageUserPropertiesJSON = JSON.stringify(
    emailMessageUserProperties,
    null,
    2
  );

  const serverInitialState: Partial<AppState> = {
    ...defaultEmailMessageState(id),
    emailMessageUserProperties,
    emailMessageUserPropertiesJSON,
  };

  serverInitialState.userProperties = {
    type: CompletionStatus.Successful,
    value: userProperties.flatMap((up) =>
      toUserPropertyResource(up).unwrapOr([])
    ),
  };

  if (emailMessage && emailMessage.workspaceId === workspaceId) {
    const { from, subject, body, name, replyTo } = emailMessage;
    Object.assign(serverInitialState, {
      emailMessageTitle: name,
      emailMessageFrom: from,
      emailMessageSubject: subject,
      emailMessageBody: body,
    });
    if (replyTo) {
      serverInitialState.emailMessageReplyTo = replyTo;
    }
  }
  return serverInitialState;
}
