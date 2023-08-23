import { v5 as uuidv5 } from "uuid";

import { ChannelType, UpsertMessageTemplateResource } from "../types";

const welcomeBody = `<mjml>
  <mj-body background-color="#F7F8FA">
    <mj-raw>
      <!-- Image Header -->
    </mj-raw>
    <mj-section align="center">
      <mj-column>
        <mj-image width="200px" src="https://storage.googleapis.com/dittofeed-public/logo.png" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#fff">
      <mj-column width="400px">
        <mj-text color="#525252" font-size="16px"
          >Hi {{user.firstName | default: "there"}}
          <br />
          <br />
          A warm welcome to CompanyName! During this 14-day trial, you have the
          opportunity to use our product to make a difference in your
          day-to-day. We'll be providing you with a VIP tour of how to make the
          most of CompanyName.
          <br />
          <br />
          To get started, we'll integrate your data into the platform.
        </mj-text>
        <mj-button background-color="#49BCD5" href="#"
          >Setup CompanyName</mj-button
        >
        <mj-text color="#525252" font-size="16px">
          Take a look at our <a href="#">docs</a> for more info.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column width="60%">
        <mj-text align="center" color="#525252">
          MyCompany, Inc., 40 Rosewood Lane, New York, NY 10003
          <br/>
          <br/>
          Don't want to receive these emails? You can {% unsubscribe_link %} from them here.
          <br/>
          <br/>
          Powered by <a href="https://dittofeed.com" target="_blank" rel="noopener noreferrer">Dittofeed</a>.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export function getDefaultMessageTemplates({
  workspaceId,
}: {
  workspaceId: string;
}): UpsertMessageTemplateResource[] {
  return [
    {
      workspaceId,
      name: "Welcome Email",
      id: uuidv5("118318ca-ba56-44ad-856c-a9a625113f5e", workspaceId),
      definition: {
        type: ChannelType.Email,
        from: "hello@mycompany.com",
        subject: 'Hi {{ user.firstName | default: "there"}}!',
        body: welcomeBody,
      },
    },
  ];
}
