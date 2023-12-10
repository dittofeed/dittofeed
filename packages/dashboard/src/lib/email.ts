import logger from "backend-lib/src/logger";
import {
  ChannelType,
  CompletionStatus,
  EmailProviderType,
  MessageTemplateResource,
  PersistedEmailProvider,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { LoremIpsum } from "lorem-ipsum";

import {
  defaultEmailMessageState,
  defaultInitialUserProperties,
} from "../components/messages/emailEditor";
import prisma from "./prisma";
import { AppState } from "./types";

export function getEmailEditorState({
  emailTemplate,
  templateId,
  userProperties,
  memberEmail,
}: {
  emailTemplate: MessageTemplateResource | null;
  memberEmail: string;
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
    email: memberEmail,
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

export async function getOrCreateEmailProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PersistedEmailProvider[]> {
  const emailProviders = await prisma().emailProvider.findMany({
    where: { workspaceId },
  });

  const upsertPromises: Promise<unknown>[] = [];
  for (const typeKey in EmailProviderType) {
    const type = EmailProviderType[typeKey as keyof typeof EmailProviderType];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    const missing = emailProviders.find((ep) => ep.type === type) === undefined;
    if (missing) {
      upsertPromises.push(
        prisma()
          .emailProvider.upsert({
            where: {
              workspaceId_type: {
                workspaceId,
                type,
              },
            },
            create: {
              workspaceId,
              type,
            },
            update: {},
          })
          .then((ep) => emailProviders.push(ep))
      );
    }
  }
  await Promise.all(upsertPromises);
  const val = emailProviders.flatMap((ep) => {
    let type: EmailProviderType;
    switch (ep.type) {
      case EmailProviderType.Test:
        return [];
      case EmailProviderType.Sendgrid:
        type = EmailProviderType.Sendgrid;
        break;
      default:
        logger().error(`Unknown email provider type: ${ep.type}`);
        return [];
    }

    return {
      workspaceId: ep.workspaceId,
      id: ep.id,
      type,
    };
  });
  return val;
}
