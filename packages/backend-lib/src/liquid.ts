/* eslint-disable no-underscore-dangle */
import { SUBSCRIPTION_SECRET_NAME } from "isomorphic-lib/src/constants";
import { Liquid } from "liquidjs";
import MarkdownIt from "markdown-it";
import mjml2html from "mjml";

import logger from "./logger";
import { generateSubscriptionChangeUrl } from "./subscriptionGroups";
import { SubscriptionChange } from "./types";

const md = new MarkdownIt({
  html: true,
  breaks: true,
});

const baseEmailLayout = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style type="text/css">{% block style %}{% endblock %}</style>
</head>
<body>{% block content %}{% endblock %}</body>
</html>`;

const markdownEmailLayout = `{% layout 'base-email' %}{% block content %}{% capture md %}{% block md-content %}{% endblock %}{% endcapture %}{{ md | markdown }}{% endblock %}`;

const layouts: Record<string, string> = {
  "base-email": baseEmailLayout,
  "markdown-email": markdownEmailLayout,
};

function getLayout(layoutName: string): string | undefined {
  return layouts[layoutName];
}

function getLayoutUnsafe(layoutName: string): string {
  const layout = getLayout(layoutName);
  if (layout) {
    return layout;
  }
  throw new Error(`Template not found: ${layoutName}`);
}

export const liquidEngine = new Liquid({
  strictVariables: true,
  lenientIf: true,
  relativeReference: false,
  fs: {
    readFileSync(file) {
      return getLayoutUnsafe(file);
    },
    async readFile(file) {
      return getLayoutUnsafe(file);
    },
    existsSync(file) {
      return getLayout(file) !== undefined;
    },
    async exists(file) {
      return getLayout(file) !== undefined;
    },
    contains(_root, file) {
      return getLayout(file) !== undefined;
    },
    resolve(_root, file) {
      return file;
    },
  },
});

liquidEngine.registerFilter("markdown", (value) => md.render(value));

type Secrets = Record<string, string>;
type UserProperties = Record<string, string>;

liquidEngine.registerTag("unsubscribe_link", {
  parse() {},
  render(scope) {
    logger().debug("Rendering unsubscribe link");
    const allScope = scope.getAll() as Record<string, unknown>;
    const secrets = allScope.secrets as Secrets | undefined;
    const workspaceId = allScope.workspace_id as string;
    const subscriptionGroupId = allScope.subscription_group_id as
      | string
      | undefined;
    const userProperties = allScope.user as UserProperties;
    const identifierKey = allScope.identifier_key as string;

    let href = "";

    const identifier = userProperties[identifierKey];
    const userId = userProperties.id;
    const subscriptionSecret = secrets?.[SUBSCRIPTION_SECRET_NAME];
    if (subscriptionSecret && identifier && userId) {
      const url = generateSubscriptionChangeUrl({
        workspaceId,
        identifier,
        identifierKey,
        subscriptionSecret,
        userId,
        changedSubscription: subscriptionGroupId,
        subscriptionChange: SubscriptionChange.Unsubscribe,
      });
      href = `href="${url}"`;
    } else {
      logger().debug(
        {
          hasSubscriptionSecret: !!subscriptionSecret,
          identifier,
          userId,
        },
        "Unsubscribe link not rendering"
      );
    }

    // Note that clicktracking=off is added to the unsubscribe link to prevent sendgrid from including link tracking
    return `<a class="df-unsubscribe" clicktracking=off ${href}>unsubscribe</a>`;
  },
});

const MJML_NOT_PRESENT_ERROR =
  "Check that your structure is correct and enclosed in <mjml> tags";

export function renderLiquid({
  template,
  userProperties,
  workspaceId,
  subscriptionGroupId,
  identifierKey,
  secrets = {},
  mjml = false,
}: {
  template: string;
  mjml?: boolean;
  identifierKey: string;
  userProperties: UserProperties;
  secrets?: Secrets;
  subscriptionGroupId?: string;
  workspaceId: string;
}): string {
  if (!template.length) {
    return "";
  }

  const liquidRendered = liquidEngine.parseAndRenderSync(template, {
    user: userProperties,
    workspace_id: workspaceId,
    subscription_group_id: subscriptionGroupId,
    secrets,
    identifier_key: identifierKey,
  });
  if (!mjml) {
    return liquidRendered;
  }
  try {
    return mjml2html(liquidRendered).html;
  } catch (e) {
    const error = e as Error;
    if (error.message.includes(MJML_NOT_PRESENT_ERROR)) {
      return liquidRendered;
    }
    throw e;
  }
}
