import { Liquid } from "liquidjs";

export const liquidEngine = new Liquid({
  strictVariables: true,
  lenientIf: true,
});

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
