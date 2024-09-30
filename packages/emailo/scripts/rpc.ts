import { Liquid } from "liquidjs";
import mjml2html from "mjml";

export const liquidEngine = new Liquid({
  strictVariables: true,
  lenientIf: true,
  relativeReference: false,
});

liquidEngine.registerTag("unsubscribe_url", {
  render() {
    return "https://dittofeed.com";
  },
});

export interface MJMLError {
  message: string;
  line: number;
  formattedMessage: string;
  tagName: string;
}

function mjmlToHtml(
  html: string,
  user?: Record<string, any>,
): string | MJMLError[] {
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
    return result.errors.map((e) => ({
      message: e.message,
      line: e.line,
      formattedMessage: e.formattedMessage,
      tagName: e.tagName,
    }));
  }
  return result.html;
}

export const serverFunctions = { mjmlToHtml };
