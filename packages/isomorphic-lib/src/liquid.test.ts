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
});
