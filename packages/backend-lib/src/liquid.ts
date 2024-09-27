/* eslint-disable no-underscore-dangle */
import { SecretNames } from "isomorphic-lib/src/constants";
import { Liquid } from "liquidjs";
import MarkdownIt from "markdown-it";
import mjml2html from "mjml";

import logger from "./logger";
import { generateSubscriptionChangeUrl } from "./subscriptionGroups";
import { MessageTags, SubscriptionChange } from "./types";
import { assignmentAsString, UserPropertyAssignments } from "./userProperties";

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
    // eslint-disable-next-line @typescript-eslint/require-await
    async readFile(file) {
      return getLayoutUnsafe(file);
    },
    existsSync(file) {
      return getLayout(file) !== undefined;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
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

liquidEngine.registerFilter("markdown", (value) => md.render(value as string));

type Secrets = Record<string, string>;

function generateUnsubscribeUrl(scope: any): string {
  const allScope = scope.getAll() as Record<string, unknown>;
  const secrets = allScope.secrets as Secrets | undefined;
  const workspaceId = allScope.workspace_id as string;
  const subscriptionGroupId = allScope.subscription_group_id as
    | string
    | undefined;
  const userProperties = allScope.user as UserPropertyAssignments;
  const identifierKey = allScope.identifier_key as string | undefined;

  const identifier = identifierKey
    ? assignmentAsString(userProperties, identifierKey)
    : null;
  const userId = assignmentAsString(userProperties, "id");

  const subscriptionSecret = secrets?.[SecretNames.Subscription];
  if (subscriptionSecret && identifierKey && identifier && userId) {
    return generateSubscriptionChangeUrl({
      workspaceId,
      identifier,
      identifierKey,
      subscriptionSecret,
      userId,
      changedSubscription: subscriptionGroupId,
      subscriptionChange: SubscriptionChange.Unsubscribe,
    });
  }

  logger().error(
    {
      hasSubscriptionSecret: !!subscriptionSecret,
      identifierKey,
      identifier,
      userId,
    },
    "Unsubscribe URL not generating",
  );
  return "";
}

liquidEngine.registerTag("unsubscribe_link", {
  parse(tagToken) {
    this.contents = tagToken.args;
  },
  render(scope) {
    const linkText: string = (this.contents as string) || "unsubscribe";
    const url = generateUnsubscribeUrl(scope);
    const href = url ? `href="${url}"` : "";

    // Note that clicktracking=off is added to the unsubscribe link to prevent sendgrid from including link tracking
    return `<a class="df-unsubscribe" clicktracking=off ${href} target="_blank">${linkText}</a>`;
  },
});

// Add the new unsubscribe_url tag
liquidEngine.registerTag("unsubscribe_url", {
  render(scope) {
    return generateUnsubscribeUrl(scope);
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
  tags,
}: {
  template?: string;
  mjml?: boolean;
  identifierKey?: string;
  userProperties: UserPropertyAssignments;
  secrets?: Secrets;
  subscriptionGroupId?: string;
  workspaceId: string;
  // TODO [DF-471] make this field required and render tags in the user property field
  tags?: MessageTags;
}): string {
  if (!template?.length) {
    return "";
  }

  const liquidRendered = liquidEngine.parseAndRenderSync(template, {
    user: userProperties,
    workspace_id: workspaceId,
    subscription_group_id: subscriptionGroupId,
    secrets,
    identifier_key: identifierKey,
    // TODO [DF-471] remove default
    tags: tags ?? {},
  }) as string;
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
