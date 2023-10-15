import {
  ChannelType,
  CompletionStatus,
  MessageTemplateResource,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { LoremIpsum } from "lorem-ipsum";

import { defaultInitialUserProperties } from "../components/messages/emailEditor";
import { defaultSmsMessageState } from "../components/messages/smsEditor";
import { AppState } from "./types";

export function getSmsEditorState({
  smsTemplate: smsMessage,
  userProperties,
  templateId,
}: {
  smsTemplate: MessageTemplateResource | null;
  userProperties: UserPropertyResource[];
  templateId: string;
}): Partial<AppState> {
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

  const serverInitialState: Partial<AppState> = {
    smsMessageUserProperties,
    smsMessageUserPropertiesJSON,
  };

  serverInitialState.userProperties = {
    type: CompletionStatus.Successful,
    value: userProperties,
  };

  if (smsMessage && smsMessage.definition.type === ChannelType.Sms) {
    const { body } = smsMessage.definition;
    serverInitialState.smsMessageBody = body;
    serverInitialState.smsMessageTitle = smsMessage.name;
  } else {
    Object.assign(serverInitialState, defaultSmsMessageState(templateId));
  }

  return serverInitialState;
}
