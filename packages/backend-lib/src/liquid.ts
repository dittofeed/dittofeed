/* eslint-disable no-underscore-dangle */
import { CatalogItemAttributes } from "isomorphic-lib/src/catalog";
import { SecretNames } from "isomorphic-lib/src/constants";
import { isObject } from "isomorphic-lib/src/objects";
import {
  Context,
  Emitter,
  Liquid,
  TagToken,
  Template,
  TopLevelToken,
} from "liquidjs";
import MarkdownIt from "markdown-it";
import mjml2html from "mjml";

import config from "./config";
import logger from "./logger";
import { generateSubscriptionChangeUrl } from "./subscriptionGroups";
import { MessageTags, SubscriptionChange } from "./types";
import { assignmentAsString, UserPropertyAssignments } from "./userProperties";
import { generateViewInBrowserHash } from "./viewInBrowser";

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
  const isPreview = allScope.is_preview as boolean | undefined;

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
      isPreview,
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

function generateSubscriptionManagementUrl(scope: any): string {
  const allScope = scope.getAll() as Record<string, unknown>;
  const secrets = allScope.secrets as Secrets | undefined;
  const workspaceId = allScope.workspace_id as string;
  const userProperties = allScope.user as UserPropertyAssignments;
  const identifierKey = allScope.identifier_key as string | undefined;
  const isPreview = allScope.is_preview as boolean | undefined;

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
      isPreview,
      showAllChannels: true,
    });
  }

  logger().error(
    {
      hasSubscriptionSecret: !!subscriptionSecret,
      identifierKey,
      identifier,
      userId,
    },
    "Subscription management URL not generating",
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

liquidEngine.registerTag("subscription_management_link", {
  parse(tagToken) {
    this.contents = tagToken.args;
  },
  render(scope) {
    const linkText: string =
      (this.contents as string) || "manage subscriptions";
    const url = generateSubscriptionManagementUrl(scope);
    const href = url ? `href="${url}"` : "";

    // Note that clicktracking=off is added to the subscription management link to prevent sendgrid from including link tracking
    return `<a class="df-subscription-management" clicktracking=off ${href} target="_blank">${linkText}</a>`;
  },
});

liquidEngine.registerTag("subscription_management_url", {
  render(scope) {
    return generateSubscriptionManagementUrl(scope);
  },
});

function generateViewInBrowserUrl(scope: any): string {
  const allScope = scope.getAll() as Record<string, unknown>;
  const workspaceId = allScope.workspace_id as string;
  const messageId = allScope.message_id as string | undefined;

  const { secretKey } = config();
  if (!messageId || !secretKey) {
    logger().debug(
      {
        messageId,
        hasSecretKey: !!secretKey,
      },
      "View in browser URL not generating",
    );
    return "";
  }

  const hash = generateViewInBrowserHash({
    workspaceId,
    messageId,
    secret: secretKey,
  });

  const url = new URL(config().apiBase);
  url.pathname = "/api/public/view-in-browser";
  url.searchParams.set("w", workspaceId);
  url.searchParams.set("m", messageId);
  url.searchParams.set("h", hash);

  return url.toString();
}

liquidEngine.registerTag("view_in_browser_url", {
  render(scope) {
    return generateViewInBrowserUrl(scope);
  },
});

interface CatalogCollectionTagState {
  collectionName: string;
  variableName: string;
  templates: Template[];
}

const catalogCollectionTagState = new WeakMap<
  object,
  CatalogCollectionTagState
>();

const CATALOG_COLLECTION_ARG_PATTERN =
  /^(?:"([^"]+)"|'([^']+)')\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/;

/**
 * Renders the items of a catalog collection.
 *
 *   {% catalog_collection "BestSellerShoes" as items %}
 *     {% for item in items %}{{ item.title }}{% endfor %}
 *   {% endcatalog_collection %}
 *
 * Collection items are preloaded from the database before rendering and passed
 * in on the render scope as `catalogs`, keyed by collection name. Unknown
 * collections render as an empty list so that a missing collection never breaks
 * a send.
 */
liquidEngine.registerTag("catalog_collection", {
  parse(tagToken: TagToken, remainTokens: TopLevelToken[]) {
    const match = CATALOG_COLLECTION_ARG_PATTERN.exec(tagToken.args.trim());
    if (!match) {
      throw new Error(
        `Invalid catalog_collection tag. Expected {% catalog_collection "CollectionName" as items %}, received: {% catalog_collection ${tagToken.args} %}`,
      );
    }
    const collectionName = match[1] ?? match[2];
    const variableName = match[3];
    if (!collectionName || !variableName) {
      throw new Error(
        `Invalid catalog_collection tag arguments: {% catalog_collection ${tagToken.args} %}`,
      );
    }
    const templates: Template[] = [];
    const stream = this.liquid.parser
      .parseStream(remainTokens)
      .on(`tag:endcatalog_collection`, () => {
        stream.stop();
      })
      .on("template", (tpl: Template) => {
        templates.push(tpl);
      });
    stream.start();
    catalogCollectionTagState.set(this, {
      collectionName,
      variableName,
      templates,
    });
  },
  *render(ctx: Context, emitter: Emitter) {
    const state = catalogCollectionTagState.get(this);
    if (!state) {
      return;
    }
    const catalogsScope = ctx.get(["catalogs"]);
    const catalogs = isObject(catalogsScope) ? catalogsScope : {};
    const items = Array.isArray(catalogs[state.collectionName])
      ? catalogs[state.collectionName]
      : [];
    ctx.push({ [state.variableName]: items });
    yield this.liquid.renderer.renderTemplates(state.templates, ctx, emitter);
    ctx.pop();
  },
});

const MJML_NOT_PRESENT_ERROR =
  "Check that your structure is correct and enclosed in <mjml> tags";

export interface RenderLiquidOptions {
  template?: string;
  mjml?: boolean;
  identifierKey?: string;
  userProperties: UserPropertyAssignments;
  secrets?: Secrets;
  subscriptionGroupId?: string;
  workspaceId: string;
  // TODO [DF-471] make this field required and render tags in the user property field
  tags?: MessageTags;
  isPreview?: boolean;
  showAllChannels?: boolean;
  messageId?: string;
  // Preloaded catalog collection items, keyed by collection name.
  catalogs?: Record<string, CatalogItemAttributes[]>;
}

export function renderLiquid({
  template,
  userProperties,
  workspaceId,
  subscriptionGroupId,
  identifierKey,
  secrets = {},
  mjml = false,
  tags,
  isPreview = false,
  messageId,
  catalogs = {},
}: RenderLiquidOptions): string {
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
    is_preview: isPreview,
    message_id: messageId,
    catalogs,
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
