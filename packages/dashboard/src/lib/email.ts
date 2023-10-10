import {
  ChannelType,
  CompletionStatus,
  MessageTemplateResource,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { LoremIpsum } from "lorem-ipsum";

import {
  defaultEmailMessageState,
  defaultInitialUserProperties,
} from "../components/messages/emailEditor";
import { AppState } from "./types";

export function getEmailEditorState({
  emailTemplate,
  userProperties,
}: {
  emailTemplate: MessageTemplateResource | null;
  userProperties: UserPropertyResource[];
}): Partial<AppState> | null {
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
    emailMessageUserProperties,
    emailMessageUserPropertiesJSON,
  };

  serverInitialState.userProperties = {
    type: CompletionStatus.Successful,
    value: userProperties,
  };

  if (emailTemplate && emailTemplate.definition.type === ChannelType.Email) {
    const { from, subject, body, replyTo } = emailTemplate.definition;
    serverInitialState.emailMessageTitle = emailTemplate.name;
    serverInitialState.emailMessageFrom = from;
    serverInitialState.emailMessageSubject = subject;
    serverInitialState.emailMessageBody = body;

    if (replyTo) {
      serverInitialState.emailMessageReplyTo = replyTo;
    }
  } else if (emailTemplate) {
    Object.assign(
      serverInitialState,
      defaultEmailMessageState(emailTemplate.id)
    );
  }

  return serverInitialState;
}
