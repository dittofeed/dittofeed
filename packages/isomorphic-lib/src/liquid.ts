import { Liquid } from "liquidjs";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  breaks: true,
});

export const liquidEngine = new Liquid({
  strictVariables: true,
  lenientIf: true,
});

liquidEngine.registerFilter("markdown", (value) => md.render(value));

export function renderWithUserProperties({
  template,
  userProperties,
}: {
  template: string;
  userProperties: Record<string, string>;
}): string {
  return liquidEngine.parseAndRenderSync(template, {
    user: userProperties,
  });
}
