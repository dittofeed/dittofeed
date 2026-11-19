import { randomUUID } from "crypto";
import { SecretNames } from "isomorphic-lib/src/constants";

import config from "./config";
import { renderLiquid } from "./liquid";

const markdownTemplate = `
{% capture md %}
## Welcome, {{ user.name }}
You are a *{{ user.title }}* at our company.

- Point 1
- Point 2
{% endcapture %}
{{ md | markdown }}
`;

const expectedRenderedMarkdown = `
<h2>Welcome, Max</h2>
<p>You are a <em>Co-Founder</em> at our company.</p>
<ul>
<li>Point 1</li>
<li>Point 2</li>
</ul>
`;

const baseLayoutTemplate = `
{% layout 'base-email' %}
{% block style %}color: blue;{% endblock %}
{% block content %}my content{% endblock %}
`;

const expectedBaseLayoutTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style type="text/css">color: blue;</style>
</head>
<body>my content</body>
</html>
`;

const markdownEmailTemplate = `
{% layout 'markdown-email' %}
{% block md-content %}
## Welcome, {{ user.name }}

- Point 1
- Point 2
{% endblock %}
`;

const expectedRenderedMarkdownEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style type="text/css"></style>
</head>
<body><h2>Welcome, Max</h2>
<ul>
<li>Point 1</li>
<li>Point 2</li>
</ul>
</body>
</html>
`;

const mjmlTemplate = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text align='center'>Dittofeed Example by {{user.name}}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const expectedRenderedMjmlTemplate = `Dittofeed Example by Max`;

describe("renderWithUserProperties", () => {
  it("can render markdown that passes email validation", () => {
    const rendered = renderLiquid({
      template: markdownTemplate,
      workspaceId: randomUUID(),
      identifierKey: "email",
      userProperties: {
        name: "Max",
        title: "Co-Founder",
      },
    });
    expect(rendered.trim()).toEqual(expectedRenderedMarkdown.trim());
  });

  it("can render with the base email layout", () => {
    const rendered = renderLiquid({
      template: baseLayoutTemplate,
      workspaceId: randomUUID(),
      identifierKey: "email",
      userProperties: {},
    });
    expect(rendered.trim()).toEqual(expectedBaseLayoutTemplate.trim());
  });

  it("can render markdown email layout", () => {
    const rendered = renderLiquid({
      template: markdownEmailTemplate,
      workspaceId: randomUUID(),
      identifierKey: "email",
      userProperties: {
        name: "Max",
      },
    });
    expect(rendered.trim()).toEqual(expectedRenderedMarkdownEmail.trim());
  });

  it("can render mjml email layout", () => {
    const rendered = renderLiquid({
      template: mjmlTemplate,
      workspaceId: randomUUID(),
      identifierKey: "email",
      userProperties: {
        name: "Max",
      },
    });
    expect(rendered.trim()).toEqual(
      expect.stringContaining(expectedRenderedMjmlTemplate.trim()),
    );
  });

  describe("with all of the necessary values to render un unsubscribe link", () => {
    const expectedRenderedUnsubscribeUrl = `${config().apiBase}/api/public/subscription-management/page?w=024f3d0a-8eee-11ed-a1eb-0242ac120002&i=max%40email.com&ik=email&h=c8405195c77e89383ca6e9c4fd787a77bae5445b78dd891e0c30cd186c60a7b9&s=92edd119-3566-4c42-a91a-ff80498a1f57&sub=0`;
    const expectedRenderedUnsubscribeLink = `
      <a class="df-unsubscribe" clicktracking=off href="${expectedRenderedUnsubscribeUrl}" target="_blank">unsubscribe</a>
    `;

    it("can render an unsubscribe link", () => {
      const rendered = renderLiquid({
        template: `{% unsubscribe_link %}`,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        subscriptionGroupId: "92edd119-3566-4c42-a91a-ff80498a1f57",
        secrets: {
          [SecretNames.Subscription]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(expectedRenderedUnsubscribeLink.trim());
    });

    it("can render an unsubscribe url", () => {
      const rendered = renderLiquid({
        template: `{% unsubscribe_url %}`,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        subscriptionGroupId: "92edd119-3566-4c42-a91a-ff80498a1f57",
        secrets: {
          [SecretNames.Subscription]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(expectedRenderedUnsubscribeUrl.trim());
    });
  });

  describe("when text is passed to the unsubscribe link", () => {
    const unsubscribeTemplate = `
      {% unsubscribe_link here %}
    `;

    const expectedRenderedUnsubscribeEmail = `
      <a class="df-unsubscribe" clicktracking=off href="${config().apiBase}/api/public/subscription-management/page?w=024f3d0a-8eee-11ed-a1eb-0242ac120002&i=max%40email.com&ik=email&h=c8405195c77e89383ca6e9c4fd787a77bae5445b78dd891e0c30cd186c60a7b9&s=92edd119-3566-4c42-a91a-ff80498a1f57&sub=0" target="_blank">here</a>
    `;

    it("can render an unsubscribe link", () => {
      const rendered = renderLiquid({
        template: unsubscribeTemplate,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        subscriptionGroupId: "92edd119-3566-4c42-a91a-ff80498a1f57",
        secrets: {
          [SecretNames.Subscription]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(expectedRenderedUnsubscribeEmail.trim());
    });
  });

  describe("with all of the necessary values to render a subscription management link", () => {
    const expectedRenderedSubscriptionManagementUrl = `${config().apiBase}/api/public/subscription-management/page?w=024f3d0a-8eee-11ed-a1eb-0242ac120002&i=max%40email.com&ik=email&h=c8405195c77e89383ca6e9c4fd787a77bae5445b78dd891e0c30cd186c60a7b9&showAllChannels=true`;
    const expectedRenderedSubscriptionManagementLink = `
      <a class="df-subscription-management" clicktracking=off href="${expectedRenderedSubscriptionManagementUrl}" target="_blank">manage subscriptions</a>
    `;

    it("can render a subscription management link", () => {
      const rendered = renderLiquid({
        template: `{% subscription_management_link %}`,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        secrets: {
          [SecretNames.Subscription]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(
        expectedRenderedSubscriptionManagementLink.trim(),
      );
    });

    it("can render a subscription management url", () => {
      const rendered = renderLiquid({
        template: `{% subscription_management_url %}`,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        secrets: {
          [SecretNames.Subscription]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(
        expectedRenderedSubscriptionManagementUrl.trim(),
      );
    });
  });

  describe("when text is passed to the subscription management link", () => {
    const subscriptionManagementTemplate = `
      {% subscription_management_link here %}
    `;

    const expectedRenderedSubscriptionManagementEmail = `
      <a class="df-subscription-management" clicktracking=off href="${config().apiBase}/api/public/subscription-management/page?w=024f3d0a-8eee-11ed-a1eb-0242ac120002&i=max%40email.com&ik=email&h=c8405195c77e89383ca6e9c4fd787a77bae5445b78dd891e0c30cd186c60a7b9&showAllChannels=true" target="_blank">here</a>
    `;

    it("can render a subscription management link", () => {
      const rendered = renderLiquid({
        template: subscriptionManagementTemplate,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        secrets: {
          [SecretNames.Subscription]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(
        expectedRenderedSubscriptionManagementEmail.trim(),
      );
    });
  });

  describe.skip("when inlining a file", () => {
    describe("when the rendered user property is not a file", () => {});
    describe("when the rendered user property is a file", () => {
      it("can render the file inline", () => {});
    });
  });

  describe("view_in_browser_url tag", () => {
    it("returns empty string when messageId is missing", () => {
      const rendered = renderLiquid({
        template: `{% view_in_browser_url %}`,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        userProperties: {},
      });
      expect(rendered.trim()).toEqual("");
    });

    it("generates a valid view in browser URL", () => {
      const workspaceId = "024f3d0a-8eee-11ed-a1eb-0242ac120002";
      const messageId = "msg-123";
      const rendered = renderLiquid({
        template: `{% view_in_browser_url %}`,
        workspaceId,
        messageId,
        userProperties: {},
      });
      // URL should contain workspace, message, and hash params
      expect(rendered).toContain("/api/public/view-in-browser");
      expect(rendered).toContain(`w=${workspaceId}`);
      expect(rendered).toContain(`m=${messageId}`);
      expect(rendered).toContain("h=");
    });
  });

  describe("snippet tag", () => {
    const workspaceId = "024f3d0a-8eee-11ed-a1eb-0242ac120002";

    it("renders the body of a named snippet", () => {
      const rendered = renderLiquid({
        template: `{% snippet "header" %}`,
        workspaceId,
        userProperties: {},
        snippets: { header: "<h1>Shop</h1>" },
      });
      expect(rendered.trim()).toEqual("<h1>Shop</h1>");
    });

    it("renders the snippet against the same user scope", () => {
      const rendered = renderLiquid({
        template: `{% snippet "greeting" %}`,
        workspaceId,
        userProperties: { name: "Max" },
        snippets: { greeting: "Hello {{ user.name }}" },
      });
      expect(rendered.trim()).toEqual("Hello Max");
    });

    it("exposes keyword arguments to the snippet and keeps them out of the caller", () => {
      const rendered = renderLiquid({
        template: `{% snippet "card", title: "Court Shoe" %}|{% if title %}leaked{% else %}clean{% endif %}`,
        workspaceId,
        userProperties: {},
        snippets: { card: "<b>{{ title }}</b>" },
      });
      expect(rendered.trim()).toEqual("<b>Court Shoe</b>|clean");
    });

    it("lets an argument shadow the caller's variable without leaking back", () => {
      const rendered = renderLiquid({
        template: `{% snippet "card", name: "inner" %}|{{ user.name }}`,
        workspaceId,
        userProperties: { name: "outer" },
        snippets: { card: "{{ user.name }}|{{ name }}" },
      });
      expect(rendered.trim()).toEqual("outer|inner|outer");
    });

    it("renders a snippet that includes another snippet", () => {
      const rendered = renderLiquid({
        template: `{% snippet "page" %}`,
        workspaceId,
        userProperties: {},
        snippets: {
          page: `[{% snippet "header" %}]`,
          header: "HEADER",
        },
      });
      expect(rendered.trim()).toEqual("[HEADER]");
    });

    it("renders the same snippet twice with different arguments", () => {
      const rendered = renderLiquid({
        template: `{% snippet "item", name: "a" %}{% snippet "item", name: "b" %}`,
        workspaceId,
        userProperties: {},
        snippets: { item: "{{ name }};" },
      });
      expect(rendered.trim()).toEqual("a;b;");
    });

    it("renders a snippet inside a loop", () => {
      const rendered = renderLiquid({
        template: `{% for item in user.items %}{% snippet "row", item: item %}{% endfor %}`,
        workspaceId,
        userProperties: { items: [{ title: "Court Shoe" }] },
        snippets: { row: "{{ item.title }};" },
      });
      expect(rendered.trim()).toEqual("Court Shoe;");
    });

    it("renders nothing when the snippet is unknown", () => {
      const rendered = renderLiquid({
        template: `[{% snippet "missing" %}]`,
        workspaceId,
        userProperties: {},
        snippets: { header: "HEADER" },
      });
      expect(rendered.trim()).toEqual("[]");
    });

    it("renders nothing when no snippets are supplied", () => {
      const rendered = renderLiquid({
        template: `[{% snippet "header" %}]`,
        workspaceId,
        userProperties: {},
      });
      expect(rendered.trim()).toEqual("[]");
    });

    it("rejects a snippet that includes itself", () => {
      expect(() =>
        renderLiquid({
          template: `{% snippet "a" %}`,
          workspaceId,
          userProperties: {},
          snippets: { a: `{% snippet "a" %}` },
        }),
      ).toThrow(/includes itself/);
    });

    it("rejects a cycle that spans more than one snippet", () => {
      expect(() =>
        renderLiquid({
          template: `{% snippet "a" %}`,
          workspaceId,
          userProperties: {},
          snippets: {
            a: `{% snippet "b" %}`,
            b: `{% snippet "a" %}`,
          },
        }),
      ).toThrow(/includes itself/);
    });

    it("rejects nesting deeper than the configured maximum", () => {
      expect(() =>
        renderLiquid({
          template: `{% snippet "a" %}`,
          workspaceId,
          userProperties: {},
          snippets: {
            a: `{% snippet "b" %}`,
            b: `{% snippet "c" %}`,
            c: `{% snippet "d" %}`,
            d: `{% snippet "e" %}`,
            e: `{% snippet "f" %}`,
            f: "leaf",
          },
        }),
      ).toThrow(/maximum snippet depth/);
    });

    it("renders the body without a compiled-at-first-use leak between names", () => {
      const rendered = renderLiquid({
        template: `{% snippet "a" %}{% snippet "b" %}`,
        workspaceId,
        userProperties: {},
        snippets: { a: "A", b: "A" },
      });
      expect(rendered.trim()).toEqual("AA");
    });
  });
});
