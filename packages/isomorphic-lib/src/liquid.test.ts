import { renderWithUserProperties } from "./liquid";

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
{% block content %}
## Welcome, {{ user.name }}

- Point 1
- Point 2
{% endblock %}
`;

const expectedRenderedMarkdownEmail = `
<h2>Welcome, Max</h2>
<p>You are a <em>Co-Founder</em> at our company.</p>
<ul>
<li>Point 1</li>
<li>Point 2</li>
</ul>
`;

describe("renderWithUserProperties", () => {
  it("can render markdown that passes email validation", async () => {
    const rendered = renderWithUserProperties({
      template: markdownTemplate,
      userProperties: {
        name: "Max",
        title: "Co-Founder",
      },
    });
    expect(rendered.trim()).toEqual(expectedRenderedMarkdown.trim());
  });

  it("can render with the base email layout", async () => {
    const rendered = renderWithUserProperties({
      template: baseLayoutTemplate,
      userProperties: {},
    });
    expect(rendered.trim()).toEqual(expectedBaseLayoutTemplate.trim());
  });

  it("can render markdown email layout", async () => {
    const rendered = renderWithUserProperties({
      template: markdownEmailTemplate,
      userProperties: {
        name: "Max",
      },
    });
    expect(rendered.trim()).toEqual(expectedRenderedMarkdownEmail.trim());
  });
});
