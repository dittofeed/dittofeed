import { v5 as uuidv5 } from "uuid";

import {
  ChannelType,
  EmailTemplateResource,
  UpsertMessageTemplateResource,
} from "../types";

const welcomeBody = `<mjml>
  <mj-head>
    <mj-style inline="inline">
      .df-unsubscribe {
        color: #a8a8a8;
        text-decoration: underline;
      }
    </mj-style>
  </mj-head>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-size="16px" align="left">
          Hi {{ user.firstName | default: "there"}}<br/><br/>
          A warm welcome to CompanyName! During this 14-day trial, you have the opportunity to use our product to make a difference in your day-to-day. We'll be providing you with a VIP tour of how to make the most of CompanyName.<br/><br/>
          To get started, we'll integrate your data into the platform.<br/><br/>
Take a look at our <a href="#" target="_blank">docs</a> for more info.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding-top="10px">
      <mj-column>
        <mj-text font-size="12px" align="center" color="#a8a8a8">
          MyCompany, Inc., 40 Rosewood Lane, New York, NY 10003<br/>
          Don't want to receive these emails? You can {% unsubscribe_link %} from them here.<br/>
          Powered by Dittofeed.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

export const WELCOME_TEMPLATE: EmailTemplateResource = {
  type: ChannelType.Email,
  from: "hello@mycompany.com",
  subject: 'Hi {{ user.firstName | default: "there"}}!',
  body: welcomeBody,
};

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
      definition: WELCOME_TEMPLATE,
    },
  ];
}
