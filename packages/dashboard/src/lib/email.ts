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
  templateId,
  userProperties,
}: {
  emailTemplate: MessageTemplateResource | null;
  templateId: string;
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

  if (emailTemplate) {
    const definition = emailTemplate.draft ?? emailTemplate.definition;
    if (definition && definition.type === ChannelType.Email) {
      const { from, subject, body, replyTo } = definition;
      serverInitialState.emailMessageTitle = emailTemplate.name;
      serverInitialState.emailMessageFrom = from;
      serverInitialState.emailMessageSubject = subject;
      serverInitialState.emailMessageBody = body;

      if (replyTo) {
        serverInitialState.emailMessageReplyTo = replyTo;
      }
    }
  } else {
    Object.assign(serverInitialState, defaultEmailMessageState(templateId));
  }

  return serverInitialState;
}
