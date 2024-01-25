import { randomUUID } from "crypto";
import { SUBSCRIPTION_SECRET_NAME } from "isomorphic-lib/src/constants";

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
    const unsubscribeTemplate = `
      {% unsubscribe_link %}
    `;

    const expectedRenderedUnsubscribeEmail = `
      <a class="df-unsubscribe" clicktracking=off href="http://localhost:3000/dashboard/public/subscription-management?w=024f3d0a-8eee-11ed-a1eb-0242ac120002&i=max%40email.com&ik=email&h=c8405195c77e89383ca6e9c4fd787a77bae5445b78dd891e0c30cd186c60a7b9&s=92edd119-3566-4c42-a91a-ff80498a1f57&sub=0" target="_blank">unsubscribe</a>
    `;

    it("can render an unsubscribe link", () => {
      const rendered = renderLiquid({
        template: unsubscribeTemplate,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        subscriptionGroupId: "92edd119-3566-4c42-a91a-ff80498a1f57",
        secrets: {
          [SUBSCRIPTION_SECRET_NAME]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(expectedRenderedUnsubscribeEmail.trim());
    });
  });

  describe("when text is passed to the unsubscribe link", () => {
    const unsubscribeTemplate = `
      {% unsubscribe_link here %}
    `;

    const expectedRenderedUnsubscribeEmail = `
      <a class="df-unsubscribe" clicktracking=off href="http://localhost:3000/dashboard/public/subscription-management?w=024f3d0a-8eee-11ed-a1eb-0242ac120002&i=max%40email.com&ik=email&h=c8405195c77e89383ca6e9c4fd787a77bae5445b78dd891e0c30cd186c60a7b9&s=92edd119-3566-4c42-a91a-ff80498a1f57&sub=0" target="_blank">here</a>
    `;

    it("can render an unsubscribe link", () => {
      const rendered = renderLiquid({
        template: unsubscribeTemplate,
        workspaceId: "024f3d0a-8eee-11ed-a1eb-0242ac120002",
        identifierKey: "email",
        subscriptionGroupId: "92edd119-3566-4c42-a91a-ff80498a1f57",
        secrets: {
          [SUBSCRIPTION_SECRET_NAME]: "secret",
        },
        userProperties: {
          email: "max@email.com",
          id: "123",
        },
      });
      expect(rendered.trim()).toEqual(expectedRenderedUnsubscribeEmail.trim());
    });
  });
});
