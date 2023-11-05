// yarn workspace backend-lib ts-node scripts/sendgridEmail.ts --to=name@dittofeed.com --from=support@dittofeed.com
import { randomUUID } from "crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { sendMail } from "../src/destinations/sendgrid";
import logger from "../src/logger";
import prisma from "../src/prisma";

async function sendgridEmail() {
  const argv = await yargs(hideBin(process.argv))
    .options({
      to: { type: "string", demandOption: true },
      from: { type: "string", demandOption: true },
      workspaceId: { type: "string", demandOption: true },
    })
    .strict()
    .parse();

  const { workspaceId } = argv;
  const defaultEmailProvider = await prisma().defaultEmailProvider.findUnique({
    where: {
      workspaceId,
    },
    include: { emailProvider: true },
  });
  if (!defaultEmailProvider?.emailProvider.apiKey) {
    throw new Error("Default email provider not found");
  }
  const result = await sendMail({
    mailData: {
      to: argv.to,
      from: argv.from,
      subject: "Test email",
      html: "<h1>Test email</h1>",
      customArgs: {
        journeyId: randomUUID(),
        runId: randomUUID(),
        messageId: randomUUID(),
        userId: randomUUID(),
        workspaceId,
        templateId: randomUUID(),
        nodeId: randomUUID(),
      },
    },
    apiKey: defaultEmailProvider.emailProvider.apiKey,
  });
  logger().info({ result }, "Sent email");
}

sendgridEmail().catch((e) => {
  console.error(e);
  process.exit(1);
});
