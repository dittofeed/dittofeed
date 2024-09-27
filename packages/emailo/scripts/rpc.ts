import { Liquid } from "liquidjs";
import mjml2html from "mjml";

export const liquidEngine = new Liquid({
  strictVariables: true,
  lenientIf: true,
  relativeReference: false,
});

function mjmlToHtml(html: string, user?: Record<string, any>) {
  let liquidRendered: string;
  if (user) {
    liquidRendered = liquidEngine.parseAndRenderSync(html, {
      user,
    }) as string;
  } else {
    liquidRendered = html;
  }

  const result = mjml2html(liquidRendered);
  if (result.errors.length > 0) {
    console.error("mjml result.errors", result);
    throw new Error("mjml result.errors");
  }
  return result.html;
}

export const serverFunctions = { mjmlToHtml };
